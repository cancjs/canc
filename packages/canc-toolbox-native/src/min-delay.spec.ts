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

  it('rejection short-circuits the floor', async () => {
    jest.useFakeTimers();
    const error = new Error('early');
    const promise = minDelay(Promise.reject(error), 10000);
    const assertion = expect(promise).rejects.toBe(error);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('returns a plain native Promise, not a cancelable one', () => {
    const promise = minDelay(Promise.resolve('v'), 10);
    expect(promise).toBeInstanceOf(Promise);
    expect('cancel' in promise).toBe(false);
  });
});
