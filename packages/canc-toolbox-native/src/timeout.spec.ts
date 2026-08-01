import { isTimeoutError, timeout, TimeoutError } from './index';

describe('timeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the value when it settles in time (happy path)', async () => {
    await expect(timeout(Promise.resolve('fast'), 1000)).resolves.toBe('fast');
  });

  it('rejects with TimeoutError when the deadline elapses', async () => {
    jest.useFakeTimers();
    const pending = new Promise(() => {
      /* never settles */
    });
    const raced = timeout(pending, 100);
    const assertion = expect(raced).rejects.toBeInstanceOf(TimeoutError);
    jest.advanceTimersByTime(100);
    await assertion;
  });

  it('the bare form rejects with a TimeoutError once the deadline elapses', async () => {
    jest.useFakeTimers();
    const raced = timeout(50);
    const assertion = expect(raced).rejects.toBeInstanceOf(TimeoutError);
    jest.advanceTimersByTime(50);
    await assertion;
  });

  it('calls a function input immediately, before any tick', async () => {
    jest.useFakeTimers();
    const job = jest.fn(() => 'result');
    const raced = timeout(job, 50);

    expect(job).toHaveBeenCalledTimes(1);

    await expect(raced).resolves.toBe('result');
  });

  it('a thunk that throws rejects instead of throwing synchronously', async () => {
    jest.useFakeTimers();
    let raced: Promise<unknown> | undefined;

    expect(() => {
      raced = timeout(() => {
        throw new Error('x');
      }, 50);
    }).not.toThrow();

    await expect(raced).rejects.toThrow('x');
  });

  it('a function input runs immediately and the deadline lands inside a [min, max] range', async () => {
    jest.useFakeTimers();
    const job = jest.fn(
      async () =>
        await new Promise(() => {
          /* never settles */
        }),
    );

    const raced = timeout(job, [100, 200]);
    expect(job).toHaveBeenCalledTimes(1);

    const assertion = expect(raced).rejects.toBeInstanceOf(TimeoutError);
    let settled = false;
    void raced.catch(() => {
      settled = true;
    });

    jest.advanceTimersByTime(99);
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(101);
    await assertion;
  });

  it('the default duration passes the input through and schedules no timer', async () => {
    jest.useFakeTimers();
    await expect(timeout(Promise.resolve('v'))).resolves.toBe('v');
    expect(jest.getTimerCount()).toBe(0);

    await expect(timeout(Promise.resolve('v'), Infinity)).resolves.toBe('v');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('a trailing options object is not mistaken for a duration', async () => {
    jest.useFakeTimers();
    const raced = timeout(50, {});
    const assertion = expect(raced).rejects.toBeInstanceOf(TimeoutError);
    jest.advanceTimersByTime(50);
    await assertion;
  });

  it('throws RangeError synchronously for a malformed range', () => {
    expect(() => timeout([200, 100])).toThrow(RangeError);
    expect(() => timeout([-1, 5])).toThrow(RangeError);
    expect(() => timeout([1, Infinity])).toThrow(RangeError);
  });

  it('isTimeoutError identifies the error', () => {
    expect(isTimeoutError(new TimeoutError('x'))).toBe(true);
    expect(isTimeoutError(new Error('x'))).toBe(false);
  });

  it('returns a plain native Promise, not a cancelable one', () => {
    const promise = timeout(Promise.resolve('v'), 1000);
    expect(promise).toBeInstanceOf(Promise);
    expect('cancel' in promise).toBe(false);
  });

  it('wrapped promise keeps running after the timeout rejects (native Promise cannot abort)', async () => {
    jest.useFakeTimers();
    let settled = false;
    const wrapped = new Promise((resolve) => {
      setTimeout(() => {
        settled = true;
        resolve('late');
      }, 5000);
    });
    const raced = timeout(wrapped, 100);
    const assertion = expect(raced).rejects.toBeInstanceOf(TimeoutError);
    jest.advanceTimersByTime(100);
    await assertion;

    // The wrapped promise's own timer is untouched: it keeps running to completion.
    expect(settled).toBe(false);
    jest.advanceTimersByTime(4900);
    await expect(wrapped).resolves.toBe('late');
    expect(settled).toBe(true);
  });
});
