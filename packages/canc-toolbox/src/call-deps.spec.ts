import { CancelablePromise, isCancelError, TimeoutError } from '@cancjs/promise';

import { delayFactory, ITimers, TPromiseCtor } from '../../_toolbox';
import { ICancelableKind } from './deps';
import { delay, retry, timeout, waitFor } from './index';

interface IFakeTimers {
  timers: ITimers;
  setTimeout: jest.Mock<number, [handler: () => void, ms?: number]>;
  clearTimeout: jest.Mock<void, [handle: unknown]>;
  /** Every delay handed to this pair, in the order it was scheduled. */
  delays: number[];
  pending(): number;
  advance(ms: number): void;
}

/**
 * A timers pair on a virtual clock. Only what is scheduled through THIS pair advances, which is
 * what makes "the call's pair ran it, the factory's did not" an assertion rather than a guess.
 */
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
    setTimeout: setTimeoutMock,
    clearTimeout: clearTimeoutMock,
    delays,
    pending: () => scheduled.length,
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

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
}

describe('per-call dependencies (cancelable)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('delay schedules on the pair the call supplied, leaving the ambient timers untouched', async () => {
    const pair = createFakeTimers();
    const ambient = jest.spyOn(globalThis, 'setTimeout');

    const promise = delay(50, pair.timers);

    expect(pair.setTimeout).toHaveBeenCalledTimes(1);
    expect(pair.delays).toEqual([50]);
    expect(ambient).not.toHaveBeenCalled();

    pair.advance(50);

    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves the pair atomically: a call pair replaces a factory pair for scheduling AND clearing', async () => {
    const factoryPair = createFakeTimers();
    const callPair = createFakeTimers();
    const boundDelay = delayFactory<ICancelableKind>({
      Impl: CancelablePromise as unknown as TPromiseCtor,
      cancelable: true,
      setTimeout: factoryPair.setTimeout,
      clearTimeout: factoryPair.clearTimeout,
    });

    const promise = boundDelay(50, callPair.timers);

    expect(callPair.setTimeout).toHaveBeenCalledTimes(1);
    expect(factoryPair.setTimeout).not.toHaveBeenCalled();

    promise.cancel();

    expect(callPair.clearTimeout).toHaveBeenCalledTimes(1);
    expect(factoryPair.clearTimeout).not.toHaveBeenCalled();

    const reason = await promise.then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(isCancelError(reason)).toBe(true);
  });

  it('cancelling a delay clears through the call pair', async () => {
    const pair = createFakeTimers();
    const ambientClear = jest.spyOn(globalThis, 'clearTimeout');

    const promise = delay(1000, pair.timers);

    promise.cancel();

    expect(pair.clearTimeout).toHaveBeenCalledTimes(1);
    expect(ambientClear).not.toHaveBeenCalled();
    expect(pair.pending()).toBe(0);

    const reason = await promise.then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(isCancelError(reason)).toBe(true);
  });

  it('retry waits out its backoff on the call pair, in order', async () => {
    const pair = createFakeTimers();
    let attempts = 0;

    const promise = retry(
      () => {
        attempts++;

        return CancelablePromise.reject(new Error('nope'));
      },
      {
        retries: 3,
        minTimeout: 100,
        factor: 2,
        setTimeout: pair.setTimeout,
        clearTimeout: pair.clearTimeout,
      },
    );

    await flushMicrotasks();
    expect(pair.delays).toEqual([100]);

    pair.advance(100);
    await flushMicrotasks();
    expect(pair.delays).toEqual([100, 200]);

    pair.advance(200);
    await flushMicrotasks();

    await expect(promise).rejects.toThrow('nope');
    expect(attempts).toBe(3);
  });

  it('waitFor polls and times out on the call pair', async () => {
    const pair = createFakeTimers();
    let ready = false;

    const promise = waitFor(() => ready, {
      interval: 30,
      timeout: 5000,
      setTimeout: pair.setTimeout,
      clearTimeout: pair.clearTimeout,
    });

    await flushMicrotasks();
    // The deadline goes in first, then the poll reschedules itself once the condition reads false.
    expect(pair.delays).toEqual([5000, 30]);

    ready = true;
    pair.advance(30);
    await flushMicrotasks();

    await expect(promise).resolves.toBeUndefined();
    // Both the poll timer and the deadline were cleared, and both through this pair.
    expect(pair.clearTimeout).toHaveBeenCalledTimes(2);
    expect(pair.pending()).toBe(0);
  });

  it('timeout rejects with the error constructor the call supplied', async () => {
    class LateError extends TimeoutError {}

    const pair = createFakeTimers();
    const promise = timeout(new CancelablePromise<never>(() => undefined), 100, {
      TimeoutError: LateError,
      setTimeout: pair.setTimeout,
      clearTimeout: pair.clearTimeout,
    });

    pair.advance(100);

    await expect(promise).rejects.toBeInstanceOf(LateError);
  });

  it('rejects half a timers pair at compile time', () => {
    const pair = createFakeTimers();

    // Never invoked: the passing `@ts-expect-error` above each call IS the assertion, and running
    // them would schedule real timers against the ambient clock.
    const halfPairs = (): void => {
      // @ts-expect-error clearTimeout is missing, so this is half a pair
      void delay(50, { setTimeout: pair.setTimeout });
      // @ts-expect-error setTimeout is missing, so this is half a pair
      void delay(50, { clearTimeout: pair.clearTimeout });
    };

    expect(halfPairs).toBeInstanceOf(Function);
  });
});
