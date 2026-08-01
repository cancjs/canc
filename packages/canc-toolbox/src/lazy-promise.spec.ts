import { CancelablePromise, CancelError, setPromiseImpl } from '@cancjs/promise';

import { isCancelable } from '../../_util';
import { createLazyPromise, isLazyPromise, lazy, LazyPromise } from './index';

function noop() {
  /**/
}

// A minimal thenable whose `then` is observable, so deferring the subscription to it is assertable.
function spiedThenable(value: number) {
  const then = jest.fn((onFulfilled?: ((value: number) => unknown) | null) => {
    if (onFulfilled) {
      onFulfilled(value);
    }
  });

  return { then, thenable: { then } as unknown as PromiseLike<number> };
}

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

  describe('try', () => {
    it('does not call the function until the first subscription', async () => {
      const work = jest.fn(() => 42);
      const p = LazyPromise.try(work);

      expect(work).not.toHaveBeenCalled();
      expect(p.started).toBe(false);

      expect(await p).toBe(42);
      expect(work).toHaveBeenCalledTimes(1);
    });

    it('passes the arguments through', async () => {
      const work = jest.fn((first: string, second: number) => `${first}${second}`);

      expect(await LazyPromise.try(work, 'a', 1)).toBe('a1');
      expect(work).toHaveBeenCalledWith('a', 1);
    });

    it('calls the function once for two consumers, both receiving the same value', async () => {
      const work = jest.fn(() => ({ shared: true }));
      const p = LazyPromise.try(work);

      const [first, second] = await Promise.all([Promise.resolve(p), Promise.resolve(p)]);

      expect(work).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);
    });

    it('never calls the function when canceled before any subscription', async () => {
      const work = jest.fn(() => 1);
      const p = LazyPromise.try(work);

      p.cancel('gone');

      await expect(Promise.resolve(p)).rejects.toBeInstanceOf(CancelError);
      expect(work).not.toHaveBeenCalled();
    });

    it('rejects on a synchronous throw instead of letting it escape the caller', async () => {
      const failure = new Error('sync');

      expect(() =>
        LazyPromise.try(() => {
          throw failure;
        }),
      ).not.toThrow();

      await expect(
        Promise.resolve(
          LazyPromise.try(() => {
            throw failure;
          }),
        ),
      ).rejects.toBe(failure);
    });
  });

  describe('resolve', () => {
    it('returns a lazy of the same flavor unchanged', () => {
      const original = lazy<number>((resolve) => resolve(1));

      expect(LazyPromise.resolve(original)).toBe(original);
    });

    it('leaves the returned lazy cold, then starts it exactly once on subscription', async () => {
      const work = jest.fn(() => 7);
      const original = LazyPromise.try(work);
      const same = LazyPromise.resolve(original);

      expect(same).toBe(original);
      expect(work).not.toHaveBeenCalled();

      expect(await same).toBe(7);
      expect(await same).toBe(7);
      expect(work).toHaveBeenCalledTimes(1);
    });

    it('cancels the original when the returned lazy is canceled', async () => {
      const teardown = jest.fn();
      const original = lazy<number>((_resolve, _reject, handleCancel) => handleCancel(teardown));
      const same = LazyPromise.resolve(original);

      same.then(noop, noop);
      await Promise.resolve();
      same.cancel('stop');

      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('builds a reconfigured copy when the options differ', () => {
      const original = lazy<number>((resolve) => resolve(1));

      expect(LazyPromise.resolve(original, { resettable: true })).not.toBe(original);
    });

    it('defers the subscription to a plain thenable', async () => {
      const { then, thenable } = spiedThenable(3);
      const p = LazyPromise.resolve<number>(thenable);

      expect(then).not.toHaveBeenCalled();

      expect(await p).toBe(3);
      expect(then).toHaveBeenCalledTimes(1);
    });

    it('resolves a plain value lazily', async () => {
      const p = LazyPromise.resolve(42);

      expect(p.started).toBe(false);
      expect(await p).toBe(42);
    });
  });

  describe('reject', () => {
    it('rejects with the given reason once subscribed', async () => {
      const failure = new Error('nope');
      const p = LazyPromise.reject(failure);

      expect(p.started).toBe(false);
      await expect(Promise.resolve(p)).rejects.toBe(failure);
    });
  });

  describe('combinators', () => {
    it('leaves every input cold until the aggregate is awaited', async () => {
      const first = jest.fn(() => 1);
      const second = jest.fn(() => 2);
      const aggregate = LazyPromise.all([LazyPromise.try(first), LazyPromise.try(second)]);

      expect(first).not.toHaveBeenCalled();
      expect(second).not.toHaveBeenCalled();
      expect(aggregate.started).toBe(false);

      expect(await aggregate).toEqual([1, 2]);
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('never runs an input when the aggregate is canceled before it is subscribed', async () => {
      const first = jest.fn(() => 1);
      const second = jest.fn(() => 2);
      const aggregate = LazyPromise.all([LazyPromise.try(first), LazyPromise.try(second)]);

      aggregate.cancel('stop');

      await expect(Promise.resolve(aggregate)).rejects.toBeInstanceOf(CancelError);
      expect(first).not.toHaveBeenCalled();
      expect(second).not.toHaveBeenCalled();
    });

    it('cancels the loser of a race, because the underlying implementation does', async () => {
      const loserTeardown = jest.fn();
      const winner = new CancelablePromise<string>((resolve) => setTimeout(() => resolve('winner'), 1));
      const loser = new CancelablePromise<string>((_resolve, _reject, ctx) => {
        ctx.handleCancel(loserTeardown);
      });

      expect(await LazyPromise.race([winner, loser])).toBe('winner');

      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(loserTeardown).toHaveBeenCalledTimes(1);
    });

    it('keeps race cold until subscribed', async () => {
      const first = jest.fn(() => 'first');
      const race = LazyPromise.race([LazyPromise.try(first)]);

      expect(first).not.toHaveBeenCalled();
      expect(await race).toBe('first');
    });

    it('keeps any cold until subscribed, then takes the first success', async () => {
      const succeeding = jest.fn(() => 2);
      const aggregate = LazyPromise.any<number>([LazyPromise.reject(new Error('x')), LazyPromise.try(succeeding)]);

      expect(succeeding).not.toHaveBeenCalled();
      expect(await aggregate).toBe(2);
    });

    it('keeps allSettled cold until subscribed, then reports every outcome', async () => {
      const work = jest.fn(() => 1);
      const aggregate = LazyPromise.allSettled<number>([LazyPromise.try(work), LazyPromise.reject(new Error('x'))]);

      expect(work).not.toHaveBeenCalled();

      expect((await aggregate).map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    });
  });

  describe('createLazyPromise', () => {
    it('defers a function to the first subscription', async () => {
      const work = jest.fn(() => 5);
      const p = createLazyPromise(work);

      expect(work).not.toHaveBeenCalled();
      expect(await p).toBe(5);
      expect(work).toHaveBeenCalledTimes(1);
    });

    it('rejects on a synchronous throw', async () => {
      const failure = new Error('sync');

      await expect(
        Promise.resolve(
          createLazyPromise(() => {
            throw failure;
          }),
        ),
      ).rejects.toBe(failure);
    });

    it('resolves a plain value lazily', async () => {
      const p = createLazyPromise(42);

      expect(p.started).toBe(false);
      expect(await p).toBe(42);
    });

    it('returns an existing lazy unchanged rather than wrapping it', async () => {
      const work = jest.fn(() => 7);
      const original = LazyPromise.try(work);
      const same = createLazyPromise(original);

      expect(same).toBe(original);
      expect(work).not.toHaveBeenCalled();

      expect(await same).toBe(7);
      expect(work).toHaveBeenCalledTimes(1);
    });

    it('cancels the original when the value it returned is canceled', async () => {
      const teardown = jest.fn();
      const original = lazy<number>((_resolve, _reject, handleCancel) => handleCancel(teardown));
      const same = createLazyPromise(original);

      same.then(noop, noop);
      await Promise.resolve();
      same.cancel('stop');

      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('does not subscribe to a plain thenable until the result is subscribed', async () => {
      const { then, thenable } = spiedThenable(3);
      const p = createLazyPromise<number>(thenable);

      expect(then).not.toHaveBeenCalled();

      expect(await p).toBe(3);
      expect(then).toHaveBeenCalledTimes(1);
    });

    it('applies the options it is given', async () => {
      const log: string[] = [];
      const p = createLazyPromise(1, { impl: trackingImpl(log, 'per-call') });

      await p;
      expect(log).toEqual(['per-call']);
    });
  });

  describe('withResolvers', () => {
    it('stays unstarted until someone subscribes, however early it is settled', async () => {
      const { promise, resolve } = LazyPromise.withResolvers<number>();

      expect(promise.started).toBe(false);

      resolve(5);
      await Promise.resolve();
      expect(promise.started).toBe(false);

      expect(await promise).toBe(5);
      expect(promise.started).toBe(true);
    });

    it('does not start a lazy value handed to the settler until the outer is subscribed', async () => {
      const work = jest.fn(() => 9);
      const { promise, resolve } = LazyPromise.withResolvers<number>();

      resolve(LazyPromise.try(work));
      await Promise.resolve();

      expect(work).not.toHaveBeenCalled();

      expect(await promise).toBe(9);
      expect(work).toHaveBeenCalledTimes(1);
    });

    it('never starts a settled lazy value when canceled before the first subscription', async () => {
      const work = jest.fn(() => 9);
      const { promise, resolve, cancel } = LazyPromise.withResolvers<number>();

      resolve(LazyPromise.try(work));
      cancel('stop');

      await expect(Promise.resolve(promise)).rejects.toBeInstanceOf(CancelError);
      expect(work).not.toHaveBeenCalled();
    });

    it('settles once across the start boundary', async () => {
      const { promise, resolve, reject } = LazyPromise.withResolvers<number>();

      resolve(1);
      expect(await promise).toBe(1);

      reject(new Error('late'));
      expect(await promise).toBe(1);
    });

    it('forwards a settlement made after the work has started', async () => {
      const { promise, resolve } = LazyPromise.withResolvers<number>();
      const consumer = Promise.resolve(promise.then((value) => value));

      await Promise.resolve();
      expect(promise.started).toBe(true);

      resolve(4);
      expect(await consumer).toBe(4);
    });

    it('hands back a cancel alongside the settlers', async () => {
      const { promise, cancel } = LazyPromise.withResolvers<number>();

      cancel('stop');

      await expect(Promise.resolve(promise)).rejects.toBeInstanceOf(CancelError);
    });
  });

  describe('execute', () => {
    it('starts the work so a later await gets the cached result', async () => {
      const work = jest.fn(() => 11);
      const p = LazyPromise.try(work);

      p.execute();

      expect(work).toHaveBeenCalledTimes(1);
      expect(p.started).toBe(true);
      expect(await p).toBe(11);
      expect(work).toHaveBeenCalledTimes(1);
    });

    it('runs the work once however often it is called', async () => {
      const work = jest.fn(() => 11);
      const p = LazyPromise.try(work);

      p.execute();
      p.execute();
      await p;
      p.execute();

      expect(work).toHaveBeenCalledTimes(1);
    });

    it('returns undefined', () => {
      expect(LazyPromise.try(() => 1).execute()).toBeUndefined();
    });

    it('is a no-op on a lazy canceled before it started', async () => {
      const work = jest.fn(() => 1);
      const p = LazyPromise.try(work);

      p.cancel('stop');
      p.execute();

      expect(work).not.toHaveBeenCalled();
      expect(p.started).toBe(false);

      await expect(Promise.resolve(p)).rejects.toBeInstanceOf(CancelError);
      expect(work).not.toHaveBeenCalled();
    });
  });
});
