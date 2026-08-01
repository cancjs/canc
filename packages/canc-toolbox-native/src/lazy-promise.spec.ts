import { createLazyPromise, isLazyPromise, lazy, LazyPromise } from './index';

// A minimal thenable whose `then` is observable, so deferring the subscription to it is assertable.
function spiedThenable(value: number) {
  const then = jest.fn((onFulfilled?: ((value: number) => unknown) | null) => {
    if (onFulfilled) {
      onFulfilled(value);
    }
  });

  return { then, thenable: { then } as unknown as PromiseLike<number> };
}

// Asserted as the literal registry key rather than through an exported constant: the brand is
// an implementation detail of detection, and the key itself is what has to stay stable.
const LAZY_PROMISE_BRAND = Symbol.for('@cancjs/toolbox:LazyPromise');

describe('LazyPromise', () => {
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

  describe('interop', () => {
    it('is adopted by native Promise.resolve as a PromiseLike', async () => {
      const p = lazy<string>((resolve) => resolve('ok'));
      const value = await Promise.resolve(p);
      expect(value).toBe('ok');
    });

    it('is an instance of LazyPromise', () => {
      const p = lazy<number>((resolve) => resolve(1));
      expect(p).toBeInstanceOf(LazyPromise);
    });
  });

  describe('no cancellation surface', () => {
    it('does not expose cancel on the lazy value', () => {
      const p = lazy<number>((resolve) => resolve(Promise.resolve(1)));
      expect('cancel' in p).toBe(false);
    });

    it('does not expose cancel on the resolved inner promise', async () => {
      const p = lazy<number>((resolve) => resolve(1));
      const inner = Promise.resolve(p);
      expect('cancel' in inner).toBe(false);
      await inner;
    });
  });

  describe('brand', () => {
    it('recognizes a lazy promise', () => {
      expect(isLazyPromise(new LazyPromise(() => undefined))).toBe(true);
    });

    it('rejects a plain native promise', () => {
      expect(isLazyPromise(Promise.resolve(1))).toBe(false);
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

      const base = Object.getPrototypeOf(LazyPromise.prototype) as object;
      expect(Object.prototype.hasOwnProperty.call(base, LAZY_PROMISE_BRAND)).toBe(true);
    });

    it('shares one brand key with the cancelable flavor, so one guard covers both', () => {
      const fromTheCancelableFlavor = Object.create({ [LAZY_PROMISE_BRAND]: true }) as object;

      expect(isLazyPromise(fromTheCancelableFlavor)).toBe(true);
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

    it('rejects on a synchronous throw instead of letting it escape the caller', async () => {
      const failure = new Error('sync');

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

    it('keeps race cold until subscribed, and cannot cancel the loser', async () => {
      const loser = jest.fn(() => new Promise<string>(() => undefined));
      const winner = jest.fn(() => 'winner');
      const race = LazyPromise.race<string>([LazyPromise.try(winner), LazyPromise.try(loser)]);

      expect(winner).not.toHaveBeenCalled();
      expect(await race).toBe('winner');

      // The loser was started and there is no way to stop it: the semantics are the native
      // Promise's, which is the whole difference from the cancelable flavor.
      expect(loser).toHaveBeenCalledTimes(1);
      expect('cancel' in race).toBe(false);
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

    it('gives every static a product with no cancellation surface', () => {
      expect('cancel' in LazyPromise.try(() => 1)).toBe(false);
      expect('cancel' in LazyPromise.resolve(1)).toBe(false);
      expect('cancel' in LazyPromise.all([])).toBe(false);
      expect('cancel' in LazyPromise.allSettled([])).toBe(false);
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

    it('does not subscribe to a plain thenable until the result is subscribed', async () => {
      const { then, thenable } = spiedThenable(3);
      const p = createLazyPromise<number>(thenable);

      expect(then).not.toHaveBeenCalled();

      expect(await p).toBe(3);
      expect(then).toHaveBeenCalledTimes(1);
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

    it('hands back no cancel, because there is nothing to cancel', () => {
      const resolvers = LazyPromise.withResolvers<number>();

      expect('cancel' in resolvers).toBe(false);
      expect('cancel' in resolvers.promise).toBe(false);
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
  });
});
