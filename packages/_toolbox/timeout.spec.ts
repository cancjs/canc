import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { TPromiseCtor } from './construct';
import { IToolboxDeps } from './deps';
import { IPromiseKind } from './kind';
import { isTimeoutError, timeoutFactory } from './timeout';

interface ITestKind extends IPromiseKind {
  promise: CancelablePromise<this['value']>;
  options: object;
}

const deps: IToolboxDeps<ITestKind> = { Impl: CancelablePromise as unknown as TPromiseCtor };
const timeout = timeoutFactory(deps);

describe('timeout (cancelable)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('the bare form rejects with a TimeoutError once the deadline elapses', async () => {
    jest.useFakeTimers();
    const promise = timeout(50);
    const observed = promise.catch((error: unknown) => error);

    let settled = false;
    observed.then(() => {
      settled = true;
    });

    jest.advanceTimersByTime(49);
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1);
    expect(isTimeoutError(await observed)).toBe(true);
  });

  it('adopts the settlement of an input that beats the deadline', async () => {
    jest.useFakeTimers();
    const promise = timeout(CancelablePromise.resolve('fast'), 50);
    await expect(promise).resolves.toBe('fast');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects with a TimeoutError when the input misses the deadline', async () => {
    jest.useFakeTimers();
    const input = new CancelablePromise<string>(() => {});
    input.catch(() => undefined);

    const promise = timeout(input, 50);
    const observed = promise.catch((error: unknown) => error);

    jest.advanceTimersByTime(50);
    expect(isTimeoutError(await observed)).toBe(true);
  });

  it('cancels a cancelable input with the TimeoutError as the cancel reason', async () => {
    jest.useFakeTimers();
    const input = new CancelablePromise<string>(() => {});
    input.catch(() => undefined);
    const cancelSpy = jest.spyOn(input, 'cancel');

    const promise = timeout(input, 50);
    const observed = promise.catch((error: unknown) => error);

    jest.advanceTimersByTime(50);
    await observed;

    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(isTimeoutError(cancelSpy.mock.calls[0][0])).toBe(true);
  });

  it('calls a function input immediately, before any tick', () => {
    jest.useFakeTimers();
    const job = jest.fn(() => 'result');
    const promise = timeout(job, 50);

    expect(job).toHaveBeenCalledTimes(1);

    promise.cancel();
  });

  it('a thunk that throws rejects instead of throwing synchronously', async () => {
    jest.useFakeTimers();
    let promise: CancelablePromise<unknown> | undefined;

    expect(() => {
      promise = timeout(() => {
        throw new Error('x');
      }, 50);
    }).not.toThrow();

    await expect(promise).rejects.toThrow('x');
  });

  it('a function input runs immediately and the deadline lands inside a [min, max] range', async () => {
    jest.useFakeTimers();
    const job = jest.fn(async () => {
      await new CancelablePromise<void>(() => {});
    });

    const promise = timeout(job, [100, 200]);
    expect(job).toHaveBeenCalledTimes(1);

    const observed = promise.catch((error: unknown) => error);
    let settled = false;
    observed.then(() => {
      settled = true;
    });

    jest.advanceTimersByTime(99);
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(101);
    expect(isTimeoutError(await observed)).toBe(true);
  });

  it('a trailing options object is not mistaken for a duration', async () => {
    jest.useFakeTimers();
    const promise = timeout(50, { bubble: false });
    const observed = promise.catch((error: unknown) => error);

    jest.advanceTimersByTime(50);
    expect(isTimeoutError(await observed)).toBe(true);
  });

  it('throws RangeError synchronously for a malformed range', () => {
    expect(() => timeout([200, 100])).toThrow(RangeError);
    expect(() => timeout([-1, 5])).toThrow(RangeError);
    expect(() => timeout([1, Infinity])).toThrow(RangeError);
  });

  it('canceling clears the timer and cancels a cancelable input', async () => {
    jest.useFakeTimers();
    const input = new CancelablePromise<string>(() => {});
    input.catch(() => undefined);
    const cancelSpy = jest.spyOn(input, 'cancel');

    const promise = timeout(input, 1000);
    promise.cancel();

    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);

    const reason = await promise.catch((error: unknown) => error);
    expect(isCancelError(reason)).toBe(true);
  });
});

describe('timeout: the default duration is a passthrough that schedules nothing', () => {
  function spyDeps(): { deps: IToolboxDeps<ITestKind>; setTimeout: jest.Mock; clearTimeout: jest.Mock } {
    const scheduled = jest.fn((handler: () => void, ms?: number) => setTimeout(handler, ms));
    const cleared = jest.fn((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

    return {
      deps: { Impl: CancelablePromise as unknown as TPromiseCtor, setTimeout: scheduled, clearTimeout: cleared },
      setTimeout: scheduled,
      clearTimeout: cleared,
    };
  }

  it('timeout(input) passes the value through without scheduling a timer', async () => {
    const spies = spyDeps();
    const bound = timeoutFactory(spies.deps);

    await expect(bound(CancelablePromise.resolve('v'))).resolves.toBe('v');
    expect(spies.setTimeout).not.toHaveBeenCalled();
  });

  it('timeout(input, Infinity) passes the value through without scheduling a timer', async () => {
    const spies = spyDeps();
    const bound = timeoutFactory(spies.deps);

    await expect(bound(CancelablePromise.resolve('v'), Infinity)).resolves.toBe('v');
    expect(spies.setTimeout).not.toHaveBeenCalled();
  });

  it('a real duration does schedule through the injected timers', async () => {
    const spies = spyDeps();
    const bound = timeoutFactory(spies.deps);

    await expect(bound(CancelablePromise.resolve('v'), 1000)).resolves.toBe('v');
    expect(spies.setTimeout).toHaveBeenCalledTimes(1);
    expect(spies.clearTimeout).toHaveBeenCalledTimes(1);
  });
});
