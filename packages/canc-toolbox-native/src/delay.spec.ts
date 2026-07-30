import { delay } from './index';

describe('delay', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the value after the given time (happy path)', async () => {
    const result = await delay(50, 'done');
    expect(result).toBe('done');
  });

  it('resolves undefined when no value is given', async () => {
    await expect(delay(10)).resolves.toBeUndefined();
  });

  it('returns a plain native Promise, not a cancelable one', () => {
    const promise = delay(1);
    expect(promise).toBeInstanceOf(Promise);
    expect('cancel' in promise).toBe(false);
  });

  it('no cancel: the timer runs to completion regardless', async () => {
    jest.useFakeTimers();
    const promise = delay(1000, 'x');
    jest.advanceTimersByTime(1000);
    await expect(promise).resolves.toBe('x');
  });
});
