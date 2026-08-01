import { minDelay } from './index';

describe('minDelay', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the value but not before the floor (happy path)', async () => {
    jest.useFakeTimers();
    const promise = minDelay(Promise.resolve('v'), 500);
    let settled = false;
    void promise.then(() => {
      settled = true;
    });

    // Source resolves immediately, but the 500ms floor is not yet reached.
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(500);
    await expect(promise).resolves.toBe('v');
  });

  it('does not add any wait when the input settles after the floor', async () => {
    jest.useFakeTimers();
    const input = new Promise<string>((resolve) => {
      setTimeout(() => resolve('v'), 80);
    });
    const promise = minDelay(input, 50);

    let settled = false;
    void promise.then(() => {
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

  it('calls a function input synchronously, before any tick', async () => {
    jest.useFakeTimers();
    const job = jest.fn(() => 'result');
    const promise = minDelay(job, 50);

    expect(job).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(50);
    await expect(promise).resolves.toBe('result');
  });

  it('a thunk that throws rejects instead of throwing synchronously', async () => {
    jest.useFakeTimers();
    let promise: Promise<unknown> | undefined;

    expect(() => {
      promise = minDelay(() => {
        throw new Error('x');
      }, 50);
    }).not.toThrow();

    await expect(promise).rejects.toThrow('x');
  });

  it('rejection short-circuits the floor', async () => {
    jest.useFakeTimers();
    const error = new Error('early');
    const promise = minDelay(Promise.reject(error), 10000);
    const assertion = expect(promise).rejects.toBe(error);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('throws TypeError when called with an input but no duration', () => {
    expect(() => (minDelay as (...args: unknown[]) => unknown)(Promise.resolve('v'))).toThrow(TypeError);
  });

  it('accepts a [min, max] range and floors within it', async () => {
    jest.useFakeTimers();
    const promise = minDelay('v', [100, 200]);

    let settled = false;
    void promise.then(() => {
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

  it('returns a plain native Promise, not a cancelable one', () => {
    const promise = minDelay(Promise.resolve('v'), 10);
    expect(promise).toBeInstanceOf(Promise);
    expect('cancel' in promise).toBe(false);
  });
});
