import { delay, promisify, retry, timeout, waitFor } from './index';

// `{ lazy: true }` deferred-start behavior on plain native promises: a native Promise has no
// cancel surface, so this only proves deferred start plus single-execution sharing across
// subscribers, not the cancel-before-subscription cases the cancelable twin's
// `_toolbox/construct-timed.spec.ts` covers.
describe('{ lazy: true } (native, deferred start only)', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('delay: schedules no timer at construction, exactly one at the first subscription', async () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(global, 'setTimeout');

    const promise = delay(50, { lazy: true });
    expect(spy).not.toHaveBeenCalled();

    const observed = promise.then(() => undefined);
    expect(spy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(50);
    await observed;
  });

  it('delay: two subscribers share one execution', async () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(global, 'setTimeout');
    const job = jest.fn(() => 'result');

    const promise = delay(job, 50, { lazy: true });
    const p1 = promise.then((value) => value);
    const p2 = promise.then((value) => value);

    jest.advanceTimersByTime(50);
    await expect(Promise.all([p1, p2])).resolves.toEqual(['result', 'result']);

    expect(job).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('delay: no cancel surface, deferred start only (calling cancel is a no-op, work still runs)', async () => {
    jest.useFakeTimers();
    const job = jest.fn(() => 'result');

    const promise = delay(job, 50, { lazy: true }) as unknown as {
      cancel?: (reason?: unknown) => void;
    } & Promise<string>;
    promise.cancel?.(new Error('ignored, no cancel surface on a plain native promise'));

    const observed = promise.then((value) => value);
    jest.advanceTimersByTime(50);

    await expect(observed).resolves.toBe('result');
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('timeout: schedules no timer at construction, exactly one at the first subscription', async () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(global, 'setTimeout');

    const promise = timeout(50, { lazy: true });
    expect(spy).not.toHaveBeenCalled();

    const observed = promise.catch((error: unknown) => error);
    expect(spy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(50);
    await observed;
  });

  it('retry: does not call the attempt function until the first subscription', async () => {
    const attempt = jest.fn().mockResolvedValue('ok');

    const promise = retry(attempt, { lazy: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(attempt).not.toHaveBeenCalled();

    await expect(promise).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('waitFor: does not call the condition or schedule a poll timer until the first subscription', async () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(global, 'setTimeout');
    const condition = jest.fn(() => true);

    const promise = waitFor(condition, { lazy: true });
    expect(condition).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();

    await promise;
    expect(condition).toHaveBeenCalledTimes(1);
  });

  it('promisify: does not call the underlying callback function until the first subscription', async () => {
    const cb = jest.fn((callback: (err: any, value?: string) => void) => callback(null, 'done'));
    const wrapped = promisify(cb, { lazy: true });

    const result = wrapped();
    await Promise.resolve();
    expect(cb).not.toHaveBeenCalled();

    await expect(result).resolves.toBe('done');
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
