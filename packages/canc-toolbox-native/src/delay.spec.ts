import { delay } from './index';

describe('delay', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves undefined after the given time (bare form)', async () => {
    jest.useFakeTimers();
    const promise = delay(50);
    jest.advanceTimersByTime(50);
    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves with the value after the given time (input, ms)', async () => {
    const result = await delay('done', 10);
    expect(result).toBe('done');
  });

  it('returns a plain native Promise, not a cancelable one', () => {
    const promise = delay(1);
    expect(promise).toBeInstanceOf(Promise);
    expect('cancel' in promise).toBe(false);
  });

  it('no cancel: the timer runs to completion regardless', async () => {
    jest.useFakeTimers();
    const promise = delay('x', 1000);
    jest.advanceTimersByTime(1000);
    await expect(promise).resolves.toBe('x');
  });

  it('the positional rule: two numeric args are (input, ms), not (ms, input)', async () => {
    jest.useFakeTimers();
    const promise = delay(42, 200);
    jest.advanceTimersByTime(199);
    await Promise.resolve();
    jest.advanceTimersByTime(1);
    await expect(promise).resolves.toBe(42);
  });

  it('a trailing options object is not mistaken for an input', async () => {
    jest.useFakeTimers();
    const promise = delay(200, {});
    jest.advanceTimersByTime(200);
    await expect(promise).resolves.toBeUndefined();
  });

  it('a function input is called only after the timer fires', async () => {
    jest.useFakeTimers();
    const job = jest.fn(() => 'result');
    const promise = delay(job, 50);

    expect(job).not.toHaveBeenCalled();

    jest.advanceTimersByTime(49);
    expect(job).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(job).toHaveBeenCalledTimes(1);

    await expect(promise).resolves.toBe('result');
  });

  it('a thunk that throws rejects instead of throwing synchronously', async () => {
    jest.useFakeTimers();
    let promise: Promise<unknown> | undefined;

    expect(() => {
      promise = delay(() => {
        throw new Error('x');
      }, 50);
    }).not.toThrow();

    jest.advanceTimersByTime(50);
    await expect(promise).rejects.toThrow('x');
  });

  it('a promise input rejecting early is held until the timer completes (sequential)', async () => {
    jest.useFakeTimers();
    const early = new Promise((_resolve, reject) => setTimeout(() => reject(new Error('early')), 10));
    // Observe (and silence) the standalone rejection so it does not surface as unhandled.
    early.catch(() => undefined);

    const promise = delay(early, 50);
    const observed = promise.catch((error: unknown) => error);

    jest.advanceTimersByTime(10);
    await Promise.resolve();

    jest.advanceTimersByTime(39);
    // Not yet: the timer has not completed, so the rejection must not have surfaced.
    let settled = false;
    observed.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1);
    const reason = await observed;
    expect((reason as Error).message).toBe('early');
  });

  it('resolves within a [min, max] range, and rolls more than one distinct value', async () => {
    jest.useRealTimers();
    const seen = new Set<number>();

    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      await delay([1, 10]);
      seen.add(Date.now() - start);
    }

    expect(seen.size).toBeGreaterThan(1);
  }, 10_000);

  it('throws RangeError synchronously for min > max', () => {
    expect(() => delay([200, 100])).toThrow(RangeError);
  });

  it('throws RangeError synchronously for a negative bound', () => {
    expect(() => delay([-1, 5])).toThrow(RangeError);
  });

  it('throws RangeError synchronously for a non-finite bound', () => {
    expect(() => delay([1, Infinity])).toThrow(RangeError);
  });

  it('a long delay past the platform timer limit does not resolve early', async () => {
    jest.useFakeTimers();
    const MAX_TIMEOUT = 2147483647;
    const promise = delay(MAX_TIMEOUT + 100);

    let settled = false;
    promise.then(() => {
      settled = true;
    });

    jest.advanceTimersByTime(MAX_TIMEOUT);
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(100);
    await promise;
    expect(settled).toBe(true);
  });
});
