import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { throttle } from './throttle';

describe('throttle', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('leading (default): first call invokes immediately', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = (x: number) => {
      callCount++;
      return CancelablePromise.resolve(x);
    };
    const throttled = throttle(fn, 100);

    const p = throttled(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);

    const result = await p;
    expect(result).toBe(1);
  });

  it('rate limiting: max 1 invocation per window', async () => {
    jest.useFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);
      return CancelablePromise.resolve(x);
    };
    const throttled = throttle(fn, 100);

    throttled(1);
    throttled(2);
    throttled(3);

    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([1]);

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([1, 3]);
  });

  it('trailing (default): last args invoked after window', async () => {
    jest.useFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);
      return CancelablePromise.resolve(x);
    };
    const throttled = throttle(fn, 100);

    throttled(1);
    throttled(2);
    throttled(5);

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toContain(5);
  });

  it('leading:false: no immediate call, only trailing', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return CancelablePromise.resolve(1);
    };
    const throttled = throttle(fn, 100, { leading: false });

    throttled();
    await Promise.resolve();
    expect(callCount).toBe(0);

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('trailing:false: only leading, no trailing', async () => {
    jest.useFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);
      return CancelablePromise.resolve(x);
    };
    const throttled = throttle(fn, 100, { trailing: false });

    throttled(1);
    throttled(2);
    throttled(3);

    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(calls).toEqual([1]);
  });

  it('.cancel() clears pending', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return CancelablePromise.resolve(1);
    };
    const throttled = throttle(fn, 100);

    throttled();
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);

    throttled();
    throttled.cancel();
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('.flush() invokes immediately', async () => {
    jest.useFakeTimers();
    const fn = (x: number) => CancelablePromise.resolve(x * 3);
    const throttled = throttle(fn, 100);

    throttled(1);
    throttled(4);
    const p = throttled.flush();

    expect(p).toBeDefined();
    const result = await p!;
    expect(result).toBe(12);
  });

  it('.isPending reflects timer state', () => {
    jest.useFakeTimers();
    const fn = () => CancelablePromise.resolve(1);
    const throttled = throttle(fn, 100);

    expect(throttled.isPending).toBe(false);
    throttled();
    expect(throttled.isPending).toBe(true);
    jest.advanceTimersByTime(100);
    expect(throttled.isPending).toBe(false);
  });

  it('cancel propagation: canceling returned promise cancels in-flight', async () => {
    jest.useFakeTimers();
    let innerCanceled = false;
    const fn = () =>
      new CancelablePromise<string>((_resolve, _reject, { handleCancel }) => {
        if (handleCancel)
          handleCancel(() => {
            innerCanceled = true;
          });
      });
    const throttled = throttle(fn, 50);

    const p = throttled() as CancelablePromise<string>;
    await Promise.resolve();
    await Promise.resolve();

    p.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(innerCanceled).toBe(true);
  });

  it('returned promise is CancelablePromise', () => {
    const fn = () => CancelablePromise.resolve(1);
    const throttled = throttle(fn, 100);
    const p = throttled();
    expect(p).toBeInstanceOf(CancelablePromise);
    (p as CancelablePromise<number>).cancel();
  });
});
