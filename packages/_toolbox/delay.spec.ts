import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { TPromiseCtor } from './construct';
import { delayFactory } from './delay';
import { IToolboxDeps } from './deps';
import { IPromiseKind } from './kind';
import { minDelayFactory } from './min-delay';
import { MAX_TIMEOUT } from './timers';

interface ITestKind extends IPromiseKind {
  promise: CancelablePromise<this['value']>;
  options: object;
}

const deps: IToolboxDeps<ITestKind> = { Impl: CancelablePromise as unknown as TPromiseCtor };
const delay = delayFactory(deps);
const minDelay = minDelayFactory(deps);

describe('delay (cancelable)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves undefined after the given time (bare form)', async () => {
    jest.useFakeTimers();
    const promise = delay(50);
    jest.advanceTimersByTime(50);
    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves with the value after the given time (input, ms)', async () => {
    jest.useFakeTimers();
    const promise = delay('x', 50);
    jest.advanceTimersByTime(50);
    await expect(promise).resolves.toBe('x');
  });

  it('the positional rule: two numeric args are (input, ms), not (ms, input)', async () => {
    jest.useFakeTimers();
    const promise = delay(42, 200);

    jest.advanceTimersByTime(199);
    await Promise.resolve();

    jest.advanceTimersByTime(1);
    await expect(promise).resolves.toBe(42);
  });

  it('a trailing options object is a 200ms timer, not an input', async () => {
    jest.useFakeTimers();
    const promise = delay(200, { bubble: false });
    jest.advanceTimersByTime(200);
    await expect(promise).resolves.toBeUndefined();
  });

  it('a function input is called only after the timer fires', async () => {
    jest.useFakeTimers();
    const job = jest.fn(() => 'result');
    const promise = delay(job, 50);

    expect(job).not.toHaveBeenCalled();

    jest.advanceTimersByTime(49);
    expect(job).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(job).toHaveBeenCalledTimes(1);

    await expect(promise).resolves.toBe('result');
  });

  it('a thunk that throws rejects instead of throwing synchronously', async () => {
    jest.useFakeTimers();
    let promise: CancelablePromise<unknown> | undefined;

    expect(() => {
      promise = delay(() => {
        throw new Error('x');
      }, 50);
    }).not.toThrow();

    jest.advanceTimersByTime(50);
    await expect(promise).rejects.toThrow('x');
  });

  it('a promise input rejecting early is held until the timer completes (sequential)', async () => {
    jest.useFakeTimers();
    const early = new CancelablePromise((_resolve, reject) => {
      setTimeout(() => reject(new Error('early')), 10);
    });
    early.catch(() => undefined);

    const promise = delay(early, 50);
    const observed = promise.catch((error: unknown) => error);

    jest.advanceTimersByTime(10);
    await Promise.resolve();

    let settled = false;
    observed.then(() => {
      settled = true;
    });
    jest.advanceTimersByTime(39);
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1);
    const reason = await observed;
    expect((reason as Error).message).toBe('early');
  });

  it('resolves within a [min, max] range, and rolls more than one distinct value', async () => {
    jest.useRealTimers();
    const seen = new Set<number>();

    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      await delay([1, 10]);
      seen.add(Date.now() - start);
    }

    expect(seen.size).toBeGreaterThan(1);
  }, 10_000);

  it('throws RangeError synchronously for min > max', () => {
    expect(() => delay([200, 100])).toThrow(RangeError);
  });

  it('throws RangeError synchronously for a negative bound', () => {
    expect(() => delay([-1, 5])).toThrow(RangeError);
  });

  it('throws RangeError synchronously for a non-finite bound', () => {
    expect(() => delay([1, Infinity])).toThrow(RangeError);
  });

  it('canceling before the timer fires: the thunk never runs and the timer is cleared', async () => {
    jest.useFakeTimers();
    const job = jest.fn(() => 'result');
    const promise = delay(job, 50);

    promise.cancel();

    jest.advanceTimersByTime(1000);
    expect(job).not.toHaveBeenCalled();

    const reason = await promise.catch((error: unknown) => error);
    expect(isCancelError(reason)).toBe(true);
  });

  it('canceling cancels an eagerly-supplied cancelable input', async () => {
    jest.useFakeTimers();
    const input = new CancelablePromise(() => {});
    const cancelSpy = jest.spyOn(input, 'cancel');

    const promise = delay(input, 1000);
    promise.cancel();

    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('a long delay does not resolve early (P24-1 timer wired in)', async () => {
    jest.useFakeTimers();
    const promise = delay(MAX_TIMEOUT + 100);

    let settled = false;
    promise.then(() => {
      settled = true;
    });

    jest.advanceTimersByTime(MAX_TIMEOUT);
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(100);
    await promise;
    expect(settled).toBe(true);
  });
});

// Kept in one file on purpose. The two helpers exist as a pair precisely because they answer a
// rejection differently, so the assertions that pin that difference have to move together.
describe('delay and minDelay: the rejection-timing contrast', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve();
    }
  }

  function rejectingAt(ms: number): CancelablePromise<never> {
    const source = new CancelablePromise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error('boom')), ms);
    });
    source.catch(() => undefined);

    return source;
  }

  it('delay holds an early rejection until its timer completes, minDelay reports it at once', async () => {
    jest.useFakeTimers();

    const held = delay(rejectingAt(10), 50).catch((error: unknown) => error);
    const fast = minDelay(rejectingAt(10), 50).catch((error: unknown) => error);

    let heldSettled = false;
    let fastSettled = false;
    held.then(() => {
      heldSettled = true;
    });
    fast.then(() => {
      fastSettled = true;
    });

    jest.advanceTimersByTime(10);
    await flushMicrotasks();

    // minDelay is the parallel floor, so a rejection abandons the floor immediately.
    expect(fastSettled).toBe(true);
    // delay is sequential, so nothing about the input is observed before its own timer completes.
    expect(heldSettled).toBe(false);

    jest.advanceTimersByTime(40);
    await flushMicrotasks();

    expect(heldSettled).toBe(true);
    expect(((await held) as Error).message).toBe('boom');
    expect(((await fast) as Error).message).toBe('boom');
  });
});
