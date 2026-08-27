import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { ITimers } from '../../_toolbox';
import { retry } from './index';

// Drain the microtask queue enough times to let an attempt's promise chain settle and schedule its
// backoff timer, without depending on the exact number of internal microtask hops.
async function flushMicrotasks() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

interface IFakeTimers {
  timers: ITimers;
  delays: number[];
  advance(ms: number): void;
}

/** A timers pair on a virtual clock, so recorded delays are provably the ones the call scheduled. */
function createFakeTimers(): IFakeTimers {
  const scheduled: Array<{ id: number; due: number; handler: () => void }> = [];
  const delays: number[] = [];
  let now = 0;
  let nextId = 1;

  const setTimeoutMock = jest.fn((handler: () => void, ms?: number) => {
    const id = nextId++;

    delays.push(ms ?? 0);
    scheduled.push({ id, due: now + (ms ?? 0), handler });

    return id;
  });

  const clearTimeoutMock = jest.fn((handle: unknown) => {
    const index = scheduled.findIndex((entry) => entry.id === handle);

    if (index >= 0) scheduled.splice(index, 1);
  });

  return {
    timers: { setTimeout: setTimeoutMock, clearTimeout: clearTimeoutMock },
    delays,
    advance: (ms: number) => {
      now += ms;

      for (;;) {
        const due = scheduled.filter((entry) => entry.due <= now).sort((a, b) => a.due - b.due)[0];

        if (!due) return;

        scheduled.splice(scheduled.indexOf(due), 1);
        due.handler();
      }
    },
  };
}

// This file is the cancelable twin's own retry spec, which did not exist before this change.
// It carries the same backoff-default regression coverage as the native package, plus the
// cancel-specific behavior that only applies here.
describe('retry (cancelable)', () => {
  it('resolves on the first success (happy path)', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(retry(fn, { retries: 3 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns a CancelablePromise', () => {
    const promise = retry(() => Promise.resolve('v'));
    expect(promise).toBeInstanceOf(CancelablePromise);
    promise.cancel();
  });

  // Assertion 1 (must FAIL on pre-reshape code, which has no backoff by default: every wait is 0),
  // re-run here because the cancelable twin previously had no retry spec of its own at all.
  it('the default backoff is 300, 600, 1200 for successive attempts', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn, { retries: 3, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    pair.advance(300);
    await flushMicrotasks();
    pair.advance(600);
    await flushMicrotasks();
    pair.advance(1200);
    await flushMicrotasks();

    expect(pair.delays).toEqual([300, 600, 1200]);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  // Assertion 2 (must FAIL on pre-reshape code, where `initialDelay` is an unknown key and the
  // wait is 0).
  it('initialDelay is honored', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn, { retries: 1, initialDelay: 50, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    expect(pair.delays).toEqual([50]);
  });

  // Assertion 9a
  it('canceling during a backoff wait clears the timer and starts no further attempt', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn, { retries: 3, initialDelay: 100, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(pair.delays).toEqual([100]);

    promise.cancel();

    pair.advance(1000);
    await flushMicrotasks();

    expect(fn).toHaveBeenCalledTimes(1);
    const reason = await promise.catch((error: unknown) => error);
    expect(isCancelError(reason)).toBe(true);
  });

  // Assertion 9b
  it('canceling during an in-flight attempt cancels it', async () => {
    let inner: CancelablePromise<never> | undefined;
    const fn = jest.fn(() => {
      inner = new CancelablePromise<never>((_resolve, _reject, ctx) => {
        ctx?.handleCancel(() => {
          /* the library settles this as canceled on its own */
        });
      });
      return inner;
    });

    const promise = retry(fn, { retries: 3 });

    await flushMicrotasks();
    expect(fn).toHaveBeenCalledTimes(1);

    promise.cancel();

    const innerReason = await inner!.catch((error: unknown) => error);
    expect(isCancelError(innerReason)).toBe(true);

    const outerReason = await promise.catch((error: unknown) => error);
    expect(isCancelError(outerReason)).toBe(true);
  });

  // Assertion 9c
  it('canceling during an async shouldRetry aborts the whole retry and schedules no attempt', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    let resolveShouldRetry: ((value: boolean) => void) | undefined;
    const shouldRetry = jest.fn(
      () =>
        new Promise<boolean>((res) => {
          resolveShouldRetry = res;
        }),
    );

    const promise = retry(fn, { retries: 3, initialDelay: 100, shouldRetry, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledTimes(1);

    promise.cancel();
    resolveShouldRetry?.(true);
    await flushMicrotasks();

    expect(pair.delays).toEqual([]);
    expect(fn).toHaveBeenCalledTimes(1);
    const reason = await promise.catch((error: unknown) => error);
    expect(isCancelError(reason)).toBe(true);
  });

  // Must FAIL on pre-alias code: minTimeout was an unknown key, wait was 300.
  it('minTimeout is honored as a fallback for initialDelay', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn, { retries: 1, minTimeout: 1000, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    expect(pair.delays).toEqual([1000]);
  });

  it('maxTimeout is honored as a fallback for maxDelay', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn, {
      retries: 3,
      initialDelay: 100,
      factor: 10,
      maxTimeout: 500,
      ...pair.timers,
    });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    for (let i = 0; i < 3; i++) {
      pair.advance(500);
      await flushMicrotasks();
    }

    expect(pair.delays).toEqual([100, 500, 500]);
  });

  // The new key wins when both are supplied.
  it('initialDelay wins over minTimeout when both are supplied', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn, { retries: 1, initialDelay: 50, minTimeout: 9000, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    expect(pair.delays).toEqual([50]);
  });

  // Neither supplied still means the documented defaults, not the old zero-backoff default.
  it('with neither new nor deprecated key, the documented defaults apply', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn, { retries: 1, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    expect(pair.delays).toEqual([300]);
  });
});
