import { throttle } from './throttle';

describe('throttle (native)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('leading (default): first call invokes immediately', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(1);
    };
    const throttled = throttle(fn, 100);

    throttled();
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('rate limiting: max 1 invocation per window', async () => {
    jest.useFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);
      return Promise.resolve(x);
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

  it('leading:false: only trailing', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(1);
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

  it('trailing:false: only leading', async () => {
    jest.useFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);
      return Promise.resolve(x);
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
      return Promise.resolve(1);
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
    const fn = (x: number) => Promise.resolve(x * 3);
    const throttled = throttle(fn, 100);

    throttled(4);
    const p = throttled.flush();

    expect(p).toBeDefined();
    const result = await p!;
    expect(result).toBe(12);
  });

  it('.isPending reflects timer state', () => {
    jest.useFakeTimers();
    const fn = () => Promise.resolve(1);
    const throttled = throttle(fn, 100);

    expect(throttled.isPending).toBe(false);
    throttled();
    expect(throttled.isPending).toBe(true);
    jest.advanceTimersByTime(100);
    expect(throttled.isPending).toBe(false);
  });

  it('returns a plain native Promise', () => {
    const fn = () => Promise.resolve(1);
    const throttled = throttle(fn, 100);
    const p = throttled();
    expect(p).toBeInstanceOf(Promise);
    expect('cancel' in p).toBe(false);
  });
});
