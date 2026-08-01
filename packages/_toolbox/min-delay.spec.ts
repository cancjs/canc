import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { TPromiseCtor } from './construct';
import { IToolboxDeps } from './deps';
import { IPromiseKind } from './kind';
import { minDelayFactory } from './min-delay';

interface ITestKind extends IPromiseKind {
  promise: CancelablePromise<this['value']>;
  options: object;
}

const deps: IToolboxDeps<ITestKind> = { Impl: CancelablePromise as unknown as TPromiseCtor };
const minDelay = minDelayFactory(deps);

describe('minDelay (cancelable)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('holds a value that arrives before the floor until the floor elapses', async () => {
    jest.useFakeTimers();
    const input = new CancelablePromise<string>((resolve) => {
      setTimeout(() => resolve('v'), 10);
    });
    const promise = minDelay(input, 50);

    let settled = false;
    promise.then(() => {
      settled = true;
    });

    jest.advanceTimersByTime(49);
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1);
    await expect(promise).resolves.toBe('v');
  });

  it('does not add any wait when the input settles after the floor', async () => {
    jest.useFakeTimers();
    const input = new CancelablePromise<string>((resolve) => {
      setTimeout(() => resolve('v'), 80);
    });
    const promise = minDelay(input, 50);

    let settled = false;
    promise.then(() => {
      settled = true;
    });

    jest.advanceTimersByTime(79);
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1);
    await expect(promise).resolves.toBe('v');
  });

  it('accepts a plain value as the input', async () => {
    jest.useFakeTimers();
    const promise = minDelay(42, 50);
    jest.advanceTimersByTime(50);
    await expect(promise).resolves.toBe(42);
  });

  it('calls a function input synchronously, before any tick', () => {
    jest.useFakeTimers();
    const job = jest.fn(() => 'result');
    const promise = minDelay(job, 50);

    expect(job).toHaveBeenCalledTimes(1);

    promise.cancel();
  });

  it('a thunk that throws rejects instead of throwing synchronously', async () => {
    jest.useFakeTimers();
    let promise: CancelablePromise<unknown> | undefined;

    expect(() => {
      promise = minDelay(() => {
        throw new Error('x');
      }, 50);
    }).not.toThrow();

    await expect(promise).rejects.toThrow('x');
  });

  it('throws TypeError when called with an input but no duration', () => {
    const input = CancelablePromise.resolve('v');
    expect(() => (minDelay as (...args: unknown[]) => unknown)(input)).toThrow(TypeError);
  });

  it('throws TypeError when the duration argument is an options bag', () => {
    const input = CancelablePromise.resolve('v');
    expect(() => (minDelay as (...args: unknown[]) => unknown)(input, { bubble: false })).toThrow(TypeError);
  });

  it('accepts a [min, max] range and floors within it', async () => {
    jest.useFakeTimers();
    const promise = minDelay('v', [100, 200]);

    let settled = false;
    promise.then(() => {
      settled = true;
    });

    jest.advanceTimersByTime(99);
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(101);
    await expect(promise).resolves.toBe('v');
  });

  it('throws RangeError synchronously for a malformed range', () => {
    expect(() => minDelay('v', [200, 100])).toThrow(RangeError);
    expect(() => minDelay('v', [-1, 5])).toThrow(RangeError);
    expect(() => minDelay('v', [1, Infinity])).toThrow(RangeError);
  });

  it('canceling clears the floor timer and cancels a cancelable input', async () => {
    jest.useFakeTimers();
    const input = new CancelablePromise<string>(() => {});
    input.catch(() => undefined);
    const cancelSpy = jest.spyOn(input, 'cancel');

    const promise = minDelay(input, 1000);
    promise.cancel();

    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);

    const reason = await promise.catch((error: unknown) => error);
    expect(isCancelError(reason)).toBe(true);
  });

  it('cancels the promise a function input produced', async () => {
    jest.useFakeTimers();
    const input = new CancelablePromise<string>(() => {});
    input.catch(() => undefined);
    const cancelSpy = jest.spyOn(input, 'cancel');

    const promise = minDelay(() => input, 1000);
    promise.cancel();

    expect(cancelSpy).toHaveBeenCalledTimes(1);

    await promise.catch(() => undefined);
  });
});
