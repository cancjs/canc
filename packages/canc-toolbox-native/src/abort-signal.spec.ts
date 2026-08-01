import { delay, minDelay, promisify, retry, timeout, TimeoutError, waitFor } from './index';

// Zero-dependency twin: no import from `@cancjs/promise`, so the name checks below are inlined
// rather than reusing `isAbortError`/`isCancelError` from that package. Same convention already
// duplicated in `canc-toolbox/src/abort.ts` and `canc-promise/src/helpers.ts`.
function isAbortErrorLike(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

function isCancelErrorLike(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'CancelError';
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
}

describe('native helpers honor options.signal', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('delay', () => {
    it('aborting mid-wait rejects with the signal reason, not a CancelError', async () => {
      jest.useFakeTimers();
      const controller = new AbortController();

      const promise = delay(1000, { signal: controller.signal });

      jest.advanceTimersByTime(10);
      controller.abort();
      await flushMicrotasks();

      const error = await promise.catch((e: unknown) => e);
      expect(error).toBe(controller.signal.reason);
      expect(isAbortErrorLike(error)).toBe(true);
      expect(isCancelErrorLike(error)).toBe(false);
    });

    it('a pre-aborted signal rejects immediately and the timer is never scheduled', async () => {
      const controller = new AbortController();
      controller.abort();
      const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');

      const promise = delay(1000, { signal: controller.signal });

      await expect(promise).rejects.toBe(controller.signal.reason);
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it('a pre-aborted signal never invokes a function input', async () => {
      const controller = new AbortController();
      controller.abort();
      const job = jest.fn(() => 'result');

      const promise = delay(job, 1000, { signal: controller.signal });

      await expect(promise).rejects.toBe(controller.signal.reason);
      expect(job).not.toHaveBeenCalled();
    });

    it('removes the abort listener once the delay settles normally', async () => {
      jest.useFakeTimers();
      const controller = new AbortController();
      const removeSpy = jest.spyOn(controller.signal, 'removeEventListener');

      const promise = delay(50, { signal: controller.signal });
      jest.advanceTimersByTime(50);
      await promise;

      expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    });

    it('with no signal, behavior is unchanged: the timer runs to completion', async () => {
      jest.useFakeTimers();
      const promise = delay('x', 50);
      jest.advanceTimersByTime(50);
      await expect(promise).resolves.toBe('x');
    });
  });

  describe('minDelay', () => {
    it('aborting mid-floor rejects with the signal reason', async () => {
      jest.useFakeTimers();
      const controller = new AbortController();
      const pending = new Promise(() => {
        /* never settles */
      });

      const promise = minDelay(pending, 1000, { signal: controller.signal });

      jest.advanceTimersByTime(10);
      controller.abort();
      await flushMicrotasks();

      const error = await promise.catch((e: unknown) => e);
      expect(error).toBe(controller.signal.reason);
      expect(isAbortErrorLike(error)).toBe(true);
    });

    it('a pre-aborted signal rejects immediately and the function input never runs', async () => {
      const controller = new AbortController();
      controller.abort();
      const job = jest.fn(() => 'result');

      const promise = minDelay(job, 50, { signal: controller.signal });

      await expect(promise).rejects.toBe(controller.signal.reason);
      expect(job).not.toHaveBeenCalled();
    });
  });

  describe('timeout', () => {
    it('aborting before the deadline rejects with the signal reason, not TimeoutError', async () => {
      jest.useFakeTimers();
      const controller = new AbortController();
      const pending = new Promise(() => {
        /* never settles */
      });

      const promise = timeout(pending, 1000, { signal: controller.signal });

      jest.advanceTimersByTime(10);
      controller.abort();
      await flushMicrotasks();

      const error = await promise.catch((e: unknown) => e);
      expect(error).toBe(controller.signal.reason);
      expect(error).not.toBeInstanceOf(TimeoutError);
    });

    it('a pre-aborted signal rejects immediately and the function input never runs', async () => {
      const controller = new AbortController();
      controller.abort();
      const job = jest.fn(() => 'result');

      const promise = timeout(job, 1000, { signal: controller.signal });

      await expect(promise).rejects.toBe(controller.signal.reason);
      expect(job).not.toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    it('aborting between attempts rejects with the signal reason and schedules no further attempt', async () => {
      jest.useFakeTimers();
      const controller = new AbortController();
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      const promise = retry(fn, { retries: 5, minTimeout: 100, signal: controller.signal });
      promise.catch(() => undefined);

      await flushMicrotasks();
      expect(fn).toHaveBeenCalledTimes(1);

      controller.abort();
      await flushMicrotasks();

      const error = await promise.catch((e: unknown) => e);
      expect(error).toBe(controller.signal.reason);

      const callsAtAbort = fn.mock.calls.length;
      jest.advanceTimersByTime(10_000);
      await flushMicrotasks();
      expect(fn).toHaveBeenCalledTimes(callsAtAbort);
    });

    it('a pre-aborted signal rejects immediately and the attempt function never runs', async () => {
      const controller = new AbortController();
      controller.abort();
      const fn = jest.fn();

      const promise = retry(fn, { signal: controller.signal });

      await expect(promise).rejects.toBe(controller.signal.reason);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('waitFor', () => {
    it('aborting mid-poll rejects with the signal reason and stops polling', async () => {
      jest.useFakeTimers();
      const controller = new AbortController();
      const condition = jest.fn(() => false);

      const promise = waitFor(condition, { interval: 10, signal: controller.signal });
      promise.catch(() => undefined);

      jest.advanceTimersByTime(10);
      await flushMicrotasks();
      const callsBeforeAbort = condition.mock.calls.length;
      expect(callsBeforeAbort).toBeGreaterThan(0);

      controller.abort();
      await flushMicrotasks();

      const error = await promise.catch((e: unknown) => e);
      expect(error).toBe(controller.signal.reason);

      jest.advanceTimersByTime(1000);
      await flushMicrotasks();
      expect(condition.mock.calls.length).toBe(callsBeforeAbort);
    });

    it('a pre-aborted signal rejects immediately and the condition never runs', async () => {
      const controller = new AbortController();
      controller.abort();
      const condition = jest.fn(() => true);

      const promise = waitFor(condition, { signal: controller.signal });

      await expect(promise).rejects.toBe(controller.signal.reason);
      expect(condition).not.toHaveBeenCalled();
    });
  });

  describe('promisify', () => {
    it('aborting before the callback fires rejects with the signal reason', async () => {
      const controller = new AbortController();
      const fn = (_cb: (err: unknown, value?: unknown) => void) => {
        /* never calls back */
      };

      const wrapped = promisify(fn, { signal: controller.signal });
      const promise = wrapped();

      controller.abort();
      await flushMicrotasks();

      const error = await promise.catch((e: unknown) => e);
      expect(error).toBe(controller.signal.reason);
    });

    it('a pre-aborted signal rejects immediately and the callback function never runs', async () => {
      const controller = new AbortController();
      controller.abort();
      const fn = jest.fn((cb: (err: unknown, value?: unknown) => void) => cb(null, 'v'));

      const wrapped = promisify(fn, { signal: controller.signal });

      await expect(wrapped()).rejects.toBe(controller.signal.reason);
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
