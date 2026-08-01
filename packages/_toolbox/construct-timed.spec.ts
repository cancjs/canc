import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { TPromiseCtor } from './construct';
import { delayFactory } from './delay';
import { IToolboxDeps } from './deps';
import { IPromiseKind } from './kind';
import { promisifyFactory } from './promisify';
import { retryFactory } from './retry';
import { timeoutFactory } from './timeout';
import { waitForFactory } from './wait-for';

interface ITestKind extends IPromiseKind {
  promise: CancelablePromise<this['value']>;
  options: object;
}

function spyDeps(): { deps: IToolboxDeps<ITestKind>; setTimeout: jest.Mock; clearTimeout: jest.Mock } {
  const scheduled = jest.fn((handler: () => void, ms?: number) => setTimeout(handler, ms));
  const cleared = jest.fn((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  return {
    deps: {
      Impl: CancelablePromise as unknown as TPromiseCtor,
      cancelable: true,
      setTimeout: scheduled,
      clearTimeout: cleared,
    },
    setTimeout: scheduled,
    clearTimeout: cleared,
  };
}

// { lazy: true } deferred-start behavior, cancelable flavor. Per helper: no work at construction,
// exactly one execution shared by every subscriber, and canceling before the first subscription
// means the real work never runs at all (proven by a timer/attempt/condition/callback spy, not
// just by the settled value).
describe('{ lazy: true } (cancelable)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('delay', () => {
    it('schedules no timer at construction, exactly one at the first subscription', async () => {
      jest.useFakeTimers();
      const spies = spyDeps();
      const delay = delayFactory(spies.deps);

      const promise = delay(50, { lazy: true });
      expect(spies.setTimeout).not.toHaveBeenCalled();

      const observed = promise.then(() => undefined);
      expect(spies.setTimeout).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(50);
      await observed;
    });

    it('two subscribers share one execution', async () => {
      jest.useFakeTimers();
      const spies = spyDeps();
      const delay = delayFactory(spies.deps);
      const job = jest.fn(() => 'result');

      const promise = delay(job, 50, { lazy: true });
      const p1 = promise.then((value) => value);
      const p2 = promise.then((value) => value);

      jest.advanceTimersByTime(50);
      await expect(Promise.all([p1, p2])).resolves.toEqual(['result', 'result']);

      expect(job).toHaveBeenCalledTimes(1);
      expect(spies.setTimeout).toHaveBeenCalledTimes(1);
    });

    it('canceling before the first subscription: the timer is never scheduled and the thunk never runs', async () => {
      jest.useFakeTimers();
      const spies = spyDeps();
      const delay = delayFactory(spies.deps);
      const job = jest.fn(() => 'result');

      const promise = delay(job, 50, { lazy: true });
      promise.cancel();

      expect(spies.setTimeout).not.toHaveBeenCalled();

      const reason = await promise.catch((error: unknown) => error);
      expect(isCancelError(reason)).toBe(true);
      expect(job).not.toHaveBeenCalled();
    });
  });

  describe('timeout', () => {
    it('schedules no timer at construction, exactly one at the first subscription', async () => {
      jest.useFakeTimers();
      const spies = spyDeps();
      const timeout = timeoutFactory(spies.deps);

      const promise = timeout(50, { lazy: true });
      expect(spies.setTimeout).not.toHaveBeenCalled();

      const observed = promise.catch((error: unknown) => error);
      expect(spies.setTimeout).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(50);
      await observed;
    });

    it('two subscribers share one execution', async () => {
      jest.useFakeTimers();
      const spies = spyDeps();
      const timeout = timeoutFactory(spies.deps);

      const promise = timeout(50, { lazy: true });
      const p1 = promise.catch((error: unknown) => error);
      const p2 = promise.catch((error: unknown) => error);

      jest.advanceTimersByTime(50);
      await Promise.all([p1, p2]);

      expect(spies.setTimeout).toHaveBeenCalledTimes(1);
    });

    it('canceling before the first subscription: the timer is never scheduled', async () => {
      jest.useFakeTimers();
      const spies = spyDeps();
      const timeout = timeoutFactory(spies.deps);

      const promise = timeout(50, { lazy: true });
      promise.cancel();

      expect(spies.setTimeout).not.toHaveBeenCalled();

      const reason = await promise.catch((error: unknown) => error);
      expect(isCancelError(reason)).toBe(true);
    });
  });

  describe('retry', () => {
    it('does not call the attempt function until the first subscription', async () => {
      const spies = spyDeps();
      const retry = retryFactory(spies.deps);
      const attempt = jest.fn().mockResolvedValue('ok');

      const promise = retry(attempt, { lazy: true });
      await Promise.resolve();
      await Promise.resolve();
      expect(attempt).not.toHaveBeenCalled();

      await expect(promise).resolves.toBe('ok');
      expect(attempt).toHaveBeenCalledTimes(1);
    });

    it('two subscribers share one execution', async () => {
      const spies = spyDeps();
      const retry = retryFactory(spies.deps);
      const attempt = jest.fn().mockResolvedValue('ok');

      const promise = retry(attempt, { lazy: true });
      await expect(Promise.all([promise, promise])).resolves.toEqual(['ok', 'ok']);

      expect(attempt).toHaveBeenCalledTimes(1);
    });

    it('canceling before the first subscription: the attempt function never runs', async () => {
      const spies = spyDeps();
      const retry = retryFactory(spies.deps);
      const attempt = jest.fn().mockResolvedValue('ok');

      const promise = retry(attempt, { lazy: true });
      promise.cancel();

      const reason = await promise.catch((error: unknown) => error);
      expect(isCancelError(reason)).toBe(true);
      expect(attempt).not.toHaveBeenCalled();
    });
  });

  describe('waitFor', () => {
    it('does not call the condition or schedule a poll timer until the first subscription', async () => {
      jest.useFakeTimers();
      const spies = spyDeps();
      const waitFor = waitForFactory(spies.deps);
      const condition = jest.fn(() => true);

      const promise = waitFor(condition, { lazy: true });
      expect(condition).not.toHaveBeenCalled();
      expect(spies.setTimeout).not.toHaveBeenCalled();

      await promise;
      expect(condition).toHaveBeenCalledTimes(1);
    });

    it('two subscribers share one execution', async () => {
      jest.useFakeTimers();
      const spies = spyDeps();
      const waitFor = waitForFactory(spies.deps);
      const condition = jest.fn(() => true);

      const promise = waitFor(condition, { lazy: true });
      await Promise.all([promise, promise]);

      expect(condition).toHaveBeenCalledTimes(1);
    });

    it('canceling before the first subscription: the condition never runs and no poll timer is scheduled', async () => {
      jest.useFakeTimers();
      const spies = spyDeps();
      const waitFor = waitForFactory(spies.deps);
      const condition = jest.fn(() => false);

      const promise = waitFor(condition, { lazy: true, interval: 10 });
      promise.cancel();

      expect(spies.setTimeout).not.toHaveBeenCalled();
      expect(condition).not.toHaveBeenCalled();

      const reason = await promise.catch((error: unknown) => error);
      expect(isCancelError(reason)).toBe(true);
    });
  });

  describe('promisify', () => {
    it('does not call the underlying callback function until the first subscription', async () => {
      const spies = spyDeps();
      const promisify = promisifyFactory(spies.deps);
      const cb = jest.fn((callback: (err: any, value?: string) => void) => callback(null, 'done'));

      const wrapped = promisify(cb, { lazy: true });
      const promise = wrapped();
      await Promise.resolve();
      expect(cb).not.toHaveBeenCalled();

      await expect(promise).resolves.toBe('done');
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('two subscribers share one execution', async () => {
      const spies = spyDeps();
      const promisify = promisifyFactory(spies.deps);
      const cb = jest.fn((callback: (err: any, value?: string) => void) => callback(null, 'done'));

      const wrapped = promisify(cb, { lazy: true });
      const promise = wrapped();
      await expect(Promise.all([promise, promise])).resolves.toEqual(['done', 'done']);

      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('canceling before the first subscription: the callback function never runs', async () => {
      const spies = spyDeps();
      const promisify = promisifyFactory(spies.deps);
      const cb = jest.fn((callback: (err: any, value?: string) => void) => callback(null, 'done'));

      const wrapped = promisify(cb, { lazy: true });
      const promise = wrapped();
      promise.cancel();

      const reason = await promise.catch((error: unknown) => error);
      expect(isCancelError(reason)).toBe(true);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('minDelay does not read { lazy: true } (not in scope for this task)', () => {
    it('is unaffected by the option: still starts its input eagerly', async () => {
      // Characterization, not a lazy test: `minDelay` keeps calling `construct` directly (see
      // `_toolbox/min-delay.ts`), so `{ lazy: true }` is just an opaque, unread key to it.
      const spies = spyDeps();
      const { minDelayFactory } = require('./min-delay') as typeof import('./min-delay');
      const minDelay = minDelayFactory(spies.deps);
      const job = jest.fn(() => 'result');

      minDelay(job, 10, { lazy: true } as any);
      expect(job).toHaveBeenCalledTimes(1);
    });
  });
});
