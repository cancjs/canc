import { isLazyPromise, lazy, LazyPromise } from './index';

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
});
