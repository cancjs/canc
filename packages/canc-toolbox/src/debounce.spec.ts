import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { debounce } from './debounce';

describe('debounce', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('trailing: invokes fn once after quiet period', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = (x: number) => {
      callCount++;
      return CancelablePromise.resolve(x);
    };
    const debounced = debounce(fn, 100);

    debounced(1);
    debounced(2);
    debounced(3);

    expect(callCount).toBe(0);
    jest.advanceTimersByTime(100);

    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('trailing: resolves with last call args', async () => {
    jest.useFakeTimers();
    const fn = (x: number) => CancelablePromise.resolve(x * 10);
    const debounced = debounce(fn, 50);

    debounced(1);
    debounced(2);
    const p = debounced(3);

    jest.advanceTimersByTime(50);
    const result = await p;
    expect(result).toBe(30);
  });

  it('leading: invokes immediately on first call', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = (x: number) => {
      callCount++;
      return CancelablePromise.resolve(x);
    };
    const debounced = debounce(fn, 100, { leading: true, trailing: false });

    const p = debounced(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);

    const result = await p;
    expect(result).toBe(1);
  });

  it('leading: suppresses subsequent calls during window', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = (x: number) => {
      callCount++;
      return CancelablePromise.resolve(x);
    };
    const debounced = debounce(fn, 100, { leading: true, trailing: false });

    debounced(1);
    debounced(2);
    debounced(3);

    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('leading + trailing: first invokes, last invokes after quiet', async () => {
    jest.useFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);
      return CancelablePromise.resolve(x);
    };
    const debounced = debounce(fn, 100, { leading: true, trailing: true });

    debounced(1);
    debounced(2);
    debounced(3);

    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([1]);

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([1, 3]);
  });

  it('maxWait: forces invocation even with continuous calls', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return CancelablePromise.resolve(callCount);
    };
    const debounced = debounce(fn, 100, { maxWait: 150 });

    debounced();
    jest.advanceTimersByTime(80);
    debounced();
    jest.advanceTimersByTime(70);

    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('.cancel() clears timer and rejects pending with CancelError', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return CancelablePromise.resolve('done');
    };
    const debounced = debounce(fn, 100);

    const p = debounced();
    debounced.cancel();

    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(callCount).toBe(0);
  });

  it('.flush() invokes immediately with latest args', async () => {
    jest.useFakeTimers();
    const fn = (x: number) => CancelablePromise.resolve(x * 2);
    const debounced = debounce(fn, 100);

    debounced(1);
    debounced(5);
    const p = debounced.flush();

    expect(p).toBeDefined();
    const result = await p!;
    expect(result).toBe(10);
  });

  it('.isPending is true during wait, false after', async () => {
    jest.useFakeTimers();
    const fn = () => CancelablePromise.resolve(1);
    const debounced = debounce(fn, 100);

    expect(debounced.isPending).toBe(false);
    debounced();
    expect(debounced.isPending).toBe(true);
    jest.advanceTimersByTime(100);
    expect(debounced.isPending).toBe(false);
  });

  it('cancel propagation: canceling returned promise cancels in-flight fn', async () => {
    jest.useFakeTimers();
    let innerCanceled = false;
    const fn = () =>
      new CancelablePromise<string>((_resolve, _reject, { handleCancel }) => {
        if (handleCancel)
          handleCancel(() => {
            innerCanceled = true;
          });
      });
    const debounced = debounce(fn, 50);

    const p = debounced() as CancelablePromise<string>;
    jest.advanceTimersByTime(50);
    await Promise.resolve();
    await Promise.resolve();

    p.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(innerCanceled).toBe(true);
  });

  it('superseded call: previous promise receives CancelError', async () => {
    jest.useFakeTimers();
    const fn = (x: number) => CancelablePromise.resolve(x);
    const debounced = debounce(fn, 100);

    const p1 = debounced(1);
    const p2 = debounced(2);

    const reason1 = await (p1 as CancelablePromise<number>).catch((e: any) => e);
    expect(isCancelError(reason1)).toBe(true);

    jest.advanceTimersByTime(100);
    const result2 = await p2;
    expect(result2).toBe(2);
  });

  it('fn throws: returned promise rejects with that error', async () => {
    jest.useFakeTimers();
    const err = new Error('boom');
    const fn = () => {
      throw err;
    };
    const debounced = debounce(fn, 50);

    const p = debounced();
    jest.advanceTimersByTime(50);

    const reason = await (p as unknown as CancelablePromise<any>).catch((e: any) => e);
    expect(reason).toBe(err);
  });

  it('leading:false + trailing:false: fn never called', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return CancelablePromise.resolve(1);
    };
    const debounced = debounce(fn, 100, { leading: false, trailing: false });

    debounced();
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(callCount).toBe(0);
  });

  it('zero ms: still debounces via setTimeout(0)', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return CancelablePromise.resolve(1);
    };
    const debounced = debounce(fn, 0);

    debounced();
    debounced();
    expect(callCount).toBe(0);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('returned promise is CancelablePromise', () => {
    const fn = () => CancelablePromise.resolve(1);
    const debounced = debounce(fn, 100);
    const p = debounced();
    expect(p).toBeInstanceOf(CancelablePromise);
    (p as CancelablePromise<number>).cancel();
  });
});
