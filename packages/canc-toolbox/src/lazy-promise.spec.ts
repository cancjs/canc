import { CancelablePromise, CancelError, setPromiseImpl } from '@cancjs/promise';

import { isCancelable } from '../../_util';
import { isLazyPromise, lazy, LazyPromise } from './index';

// A stand-in promise implementation that records every construction, so which implementation a lazy
// picked is observable without reaching into its internals.
function trackingImpl(log: string[], tag: string): PromiseConstructor {
  const Impl = function (executor: ConstructorParameters<PromiseConstructor>[0]) {
    log.push(tag);

    return new Promise(executor);
  } as unknown as PromiseConstructor;

  Impl.reject = Promise.reject.bind(Promise);
  Impl.resolve = Promise.resolve.bind(Promise) as PromiseConstructor['resolve'];

  return Impl;
}

// Asserted as the literal registry key rather than through an exported constant: the brand is
// an implementation detail of detection, and the key itself is what has to stay stable.
const LAZY_PROMISE_BRAND = Symbol.for('@cancjs/toolbox:LazyPromise');

describe('LazyPromise', () => {
  afterEach(() => {
    // Clear any registry override a test may have set.
    setPromiseImpl(undefined);
  });

  describe('laziness', () => {
    it('does not run the executor until first subscription', async () => {
      const executor = jest.fn((resolve: (v: number) => void) => resolve(42));
      const p = lazy<number>(executor);

      expect(executor).not.toHaveBeenCalled();
      expect(p.started).toBe(false);

      const value = await p;

      expect(executor).toHaveBeenCalledTimes(1);
      expect(p.started).toBe(true);
      expect(value).toBe(42);
    });

    it('runs the executor on catch/finally too', async () => {
      const onCatch = jest.fn((resolve: (v: number) => void) => resolve(1));
      await lazy<number>(onCatch).catch(() => 0);
      expect(onCatch).toHaveBeenCalledTimes(1);

      const onFinally = jest.fn((resolve: (v: number) => void) => resolve(1));
      await lazy<number>(onFinally).finally(() => undefined);
      expect(onFinally).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancel before start', () => {
    it('never runs the executor and rejects with CancelError', async () => {
      const executor = jest.fn((resolve: (v: number) => void) => resolve(1));
      const p = lazy<number>(executor);

      p.cancel('gone');

      expect(executor).not.toHaveBeenCalled();

      await expect(Promise.resolve(p)).rejects.toBeInstanceOf(CancelError);
      expect(executor).not.toHaveBeenCalled();
    });
  });

  describe('single execution', () => {
    it('runs the executor once for multiple subscribers, all sharing the value', async () => {
      const executor = jest.fn((resolve: (v: number) => void) => resolve(7));
      const p = lazy<number>(executor);

      const [a, b, c] = await Promise.all([
        Promise.resolve(p.then((v) => v)),
        Promise.resolve(p.then((v) => v)),
        Promise.resolve(p.then((v) => v)),
      ]);

      expect(executor).toHaveBeenCalledTimes(1);
      expect([a, b, c]).toEqual([7, 7, 7]);
    });
  });

  describe('teardown', () => {
    it('runs a handleCancel-registered teardown on cancel', async () => {
      const teardown = jest.fn();
      const p = lazy<number>((_resolve, _reject, handleCancel) => {
        handleCancel(teardown);
      });

      // Subscribe to start the executor, then cancel.
      p.then(
        () => undefined,
        () => undefined,
      );
      await Promise.resolve();
      p.cancel('stop');

      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('runs a returned teardown fn on cancel', async () => {
      const teardown = jest.fn();
      const p = lazy<number>(() => teardown);

      p.then(
        () => undefined,
        () => undefined,
      );
      await Promise.resolve();
      p.cancel('stop');

      expect(teardown).toHaveBeenCalledTimes(1);
    });
  });

  describe('interop', () => {
    it('is adopted by CancelablePromise.resolve as a PromiseLike', async () => {
      const p = lazy<string>((resolve) => resolve('ok'));
      const value = await CancelablePromise.resolve(p);
      expect(value).toBe('ok');
    });

    it('passes the shared cancelable duck-check, so existing helpers keep accepting it', () => {
      const p = lazy<number>((resolve) => resolve(1));

      expect(isCancelable(p)).toBe(true);
    });
  });

  describe('resettable', () => {
    it('re-runs the executor after all consumers cancel before settle', async () => {
      let runs = 0;
      const p = lazy<number>(
        (resolve) => {
          runs++;
          // Never settle synchronously so the pre-settle cancel window stays open.
          setTimeout(() => resolve(runs), 1000);
        },
        { resettable: true },
      );

      // First subscription starts run #1.
      p.then(
        () => undefined,
        () => undefined,
      );
      await Promise.resolve();
      expect(runs).toBe(1);

      // Last (only) consumer cancels before settle -> reset to unstarted.
      p.cancel('abort');
      expect(p.started).toBe(false);

      // New subscription re-runs the executor.
      p.then(
        () => undefined,
        () => undefined,
      );
      await Promise.resolve();
      expect(runs).toBe(2);
    });

    it('keeps running while other consumers remain', () => {
      let runs = 0;
      const p = lazy<number>(
        (resolve) => {
          runs++;
          setTimeout(() => resolve(1), 1000);
        },
        { resettable: true },
      );

      p.then(
        () => undefined,
        () => undefined,
      );
      p.then(
        () => undefined,
        () => undefined,
      );
      expect(runs).toBe(1);

      // One consumer cancels; another remains -> stays started, no reset.
      p.cancel();
      expect(p.started).toBe(true);
      expect(runs).toBe(1);
    });
  });

  describe('implementation resolution', () => {
    it('honors a per-call impl override', async () => {
      const p = lazy<number>((resolve) => resolve(5), { impl: Promise });
      expect(await p).toBe(5);
    });

    it('falls back to the app-wide registry when no per-call impl is given', async () => {
      const log: string[] = [];
      setPromiseImpl(trackingImpl(log, 'registry'));

      await lazy<number>((resolve) => resolve(1));

      expect(log).toEqual(['registry']);
    });

    it('prefers a per-call impl over the registry', async () => {
      const log: string[] = [];
      setPromiseImpl(trackingImpl(log, 'registry'));

      await lazy<number>((resolve) => resolve(1), { impl: trackingImpl(log, 'per-call') });

      expect(log).toEqual(['per-call']);
    });
  });

  describe('brand', () => {
    it('recognizes a lazy promise', () => {
      expect(isLazyPromise(new LazyPromise(() => undefined))).toBe(true);
    });

    it('rejects a plain cancelable promise', () => {
      const promise = new CancelablePromise<number>((resolve) => resolve(1));

      expect(isLazyPromise(promise)).toBe(false);
    });

    it('rejects non-objects', () => {
      expect(isLazyPromise(undefined)).toBe(false);
      expect(isLazyPromise(null)).toBe(false);
      expect(isLazyPromise(42)).toBe(false);
      expect(isLazyPromise({})).toBe(false);
    });

    it('carries the brand on the prototype, not as an own property of an instance', () => {
      const instance = new LazyPromise(() => undefined);

      expect(Object.prototype.hasOwnProperty.call(instance, LAZY_PROMISE_BRAND)).toBe(false);
      expect(Object.getOwnPropertySymbols(instance)).not.toContain(LAZY_PROMISE_BRAND);
      expect(LAZY_PROMISE_BRAND in instance).toBe(true);

      // Owned by the shared base prototype, which is what makes one guard cover every flavor.
      const base = Object.getPrototypeOf(LazyPromise.prototype) as object;
      expect(Object.prototype.hasOwnProperty.call(base, LAZY_PROMISE_BRAND)).toBe(true);
    });

    it('matches a lazy built by a separate copy of the module, which is what the registry key buys', () => {
      const fromAnotherCopy = Object.create({ [LAZY_PROMISE_BRAND]: true }) as object;

      expect(isLazyPromise(fromAnotherCopy)).toBe(true);
    });
  });
});
