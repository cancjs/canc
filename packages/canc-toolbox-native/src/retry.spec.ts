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

describe('retry', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves on the first success (happy path)', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(retry(fn, { retries: 3 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries until success', async () => {
    let calls = 0;
    const fn = jest.fn().mockImplementation(() => {
      calls++;
      return calls < 3 ? Promise.reject(new Error('fail')) : Promise.resolve('third');
    });
    await expect(retry(fn, { retries: 5, initialDelay: 0 })).resolves.toBe('third');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('rejects with the last error after exhausting retries', async () => {
    const error = new Error('always');
    const fn = jest.fn().mockRejectedValue(error);
    // retries: 1 means one retry after the first call, so 2 calls total.
    await expect(retry(fn, { retries: 1, initialDelay: 0 })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('returns a plain native Promise, not a cancelable one', () => {
    const promise = retry(() => Promise.resolve('v'));
    expect(promise).toBeInstanceOf(Promise);
    expect('cancel' in promise).toBe(false);
  });

  it('no cancel: a pending backoff wait runs to completion and attempts continue', async () => {
    jest.useFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn, { retries: 3, initialDelay: 100, factor: 2 });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    expect(fn).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(100);
    await flushMicrotasks();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // Assertion 1 (must FAIL on pre-reshape code, which has no backoff by default: every wait is 0).
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

  // Assertion 3
  it('factor: 1 produces a constant wait', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn, { retries: 3, initialDelay: 40, factor: 1, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    pair.advance(40);
    await flushMicrotasks();
    pair.advance(40);
    await flushMicrotasks();
    pair.advance(40);
    await flushMicrotasks();

    expect(pair.delays).toEqual([40, 40, 40]);
  });

  // Assertion 4
  it('maxDelay caps a long exponential sequence', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn, {
      retries: 5,
      initialDelay: 100,
      factor: 10,
      maxDelay: 500,
      ...pair.timers,
    });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    for (let i = 0; i < 5; i++) {
      pair.advance(500);
      await flushMicrotasks();
    }

    // Uncapped this would be 100, 1000, 10000, 100000, 1000000.
    expect(pair.delays).toEqual([100, 500, 500, 500, 500]);
  });

  // Assertion 5
  it('jitter: false (default) produces exactly the computed delay', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn, { retries: 1, initialDelay: 200, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    expect(pair.delays).toEqual([200]);
  });

  it('jitter: true keeps every wait within [0, computed] and produces variance', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn, { retries: 200, initialDelay: 100, factor: 1, jitter: true, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    for (let i = 0; i < 200; i++) {
      pair.advance(100);
      await flushMicrotasks();
    }

    expect(pair.delays.length).toBe(200);
    for (const wait of pair.delays) {
      expect(wait).toBeGreaterThanOrEqual(0);
      expect(wait).toBeLessThanOrEqual(100);
    }
    expect(new Set(pair.delays).size).toBeGreaterThanOrEqual(2);
  });

  it('jitter: 0.5 keeps every wait within [computed*0.5, computed*1.5]', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const promise = retry(fn, { retries: 50, initialDelay: 100, factor: 1, jitter: 0.5, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    for (let i = 0; i < 50; i++) {
      pair.advance(150);
      await flushMicrotasks();
    }

    expect(pair.delays.length).toBe(50);
    for (const wait of pair.delays) {
      expect(wait).toBeGreaterThanOrEqual(50);
      expect(wait).toBeLessThanOrEqual(150);
    }
  });

  // Assertion 6
  it('shouldRetry returning false stops immediately, rejects with the original reason, and skips onRetry', async () => {
    const pair = createFakeTimers();
    const error = new Error('boom');
    const fn = jest.fn().mockRejectedValue(error);
    const onRetry = jest.fn();
    const shouldRetry = jest.fn().mockReturnValue(false);

    await expect(retry(fn, { retries: 3, shouldRetry, onRetry, ...pair.timers })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
    expect(pair.delays).toEqual([]);
  });

  it('an async shouldRetry returning false stops immediately and rejects with the original reason', async () => {
    const pair = createFakeTimers();
    const error = new Error('boom');
    const fn = jest.fn().mockRejectedValue(error);
    const onRetry = jest.fn();
    const shouldRetry = jest.fn().mockResolvedValue(false);

    await expect(retry(fn, { retries: 3, shouldRetry, onRetry, ...pair.timers })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  // Assertion 7
  it('delay() overrides the computed wait, and undefined accepts computedDelay', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const seenCtx: unknown[] = [];
    const delayFn = jest.fn((ctx: unknown) => {
      seenCtx.push(ctx);
      return 42;
    });

    const promise = retry(fn, { retries: 1, initialDelay: 300, delay: delayFn, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    expect(pair.delays).toEqual([42]);
    expect(seenCtx[0]).toMatchObject({ attempt: 1, retriesLeft: 0, computedDelay: 300 });
    expect(typeof (seenCtx[0] as { elapsed: number }).elapsed).toBe('number');
  });

  it('delay() returning undefined accepts computedDelay verbatim', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const delayFn = jest.fn(() => undefined);

    const promise = retry(fn, { retries: 1, initialDelay: 77, delay: delayFn, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    expect(pair.delays).toEqual([77]);
  });

  // Assertion 8
  it('onRetry receives the actual delay as its third argument', async () => {
    const pair = createFakeTimers();
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const onRetry = jest.fn();

    const promise = retry(fn, { retries: 1, initialDelay: 65, delay: () => 65, onRetry, ...pair.timers });
    promise.catch(() => {
      /* swallow */
    });

    await flushMicrotasks();
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 65);
  });
});
