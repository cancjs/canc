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
