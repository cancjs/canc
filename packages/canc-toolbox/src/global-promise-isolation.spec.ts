import { CancelablePromise } from '@cancjs/promise';

import { withSignal } from './abort';
import { minDelay, retry, timeout, waitFor } from './index';

// Regression test ensures internal subscriptions never construct through a live global lookup
// of Promise.resolve under a monkeypatch by asserting utilities do not use the patched global
//
// Test bodies avoid async await because es5 emit uses a live global Promise in the awaiter helper
// which would pollute the construction count with promises the test itself created
describe('toolbox never subscribes via the live global Promise', () => {
  let RealPromise: typeof Promise;
  let patchedConstructed: unknown[];

  beforeEach(() => {
    jest.useFakeTimers();
    RealPromise = global.Promise;
    patchedConstructed = [];

    // A plain function constructor builds a real native promise via Reflect.construct to record
    // instances produced avoiding native internal slot pitfalls of a subclassed Promise
    function PatchedPromise(
      this: unknown,
      executor: (resolve: (value: unknown) => void, reject: (reason?: any) => void) => void,
    ) {
      const instance = Reflect.construct(RealPromise, [executor], PatchedPromise as any);
      patchedConstructed.push(instance);
      return instance;
    }
    PatchedPromise.prototype = Object.create(RealPromise.prototype);
    (PatchedPromise as any).resolve = RealPromise.resolve.bind(RealPromise);
    (PatchedPromise as any).reject = RealPromise.reject.bind(RealPromise);
    (PatchedPromise as any).race = RealPromise.race.bind(RealPromise);
    (PatchedPromise as any).all = RealPromise.all.bind(RealPromise);

    // Zone-style global swap: replace the global binding, not just a local alias.
    (global as any).Promise = PatchedPromise;
  });

  afterEach(() => {
    (global as any).Promise = RealPromise;
    jest.useRealTimers();
  });

  it('timeout: source subscription does not construct through the patched global', () => {
    const raced = timeout(RealPromise.resolve('v'), 1000);

    // Flush the already-fulfilled source's microtask BEFORE advancing the deadline timer, so the
    // race settles via the fast path (source wins) instead of runAllTimers firing the 1000ms
    // deadline synchronously ahead of the microtask resolution.
    return RealPromise.resolve()
      .then(() => RealPromise.resolve())
      .then(() => {
        jest.runAllTimers();

        return raced.then((value) => {
          expect(value).toBe('v');
          expect(patchedConstructed.length).toBe(0);
        });
      });
  });

  it('minDelay: source subscription does not construct through the patched global', () => {
    const raced = minDelay(RealPromise.resolve('v'), 10);
    jest.runAllTimers();

    return raced.then((value) => {
      expect(value).toBe('v');
      expect(patchedConstructed.length).toBe(0);
    });
  });

  it('waitFor: condition subscription does not construct through the patched global', () => {
    const done = waitFor(() => true, { interval: 10 });
    jest.runAllTimers();

    return done.then((value) => {
      expect(value).toBeUndefined();
      expect(patchedConstructed.length).toBe(0);
    });
  });

  it('retry: attempt subscription does not construct through the patched global', () => {
    const done = retry(() => RealPromise.resolve('ok'));
    jest.runAllTimers();

    return done.then((value) => {
      expect(value).toBe('ok');
      expect(patchedConstructed.length).toBe(0);
    });
  });

  it('withSignal (no Impl in scope): still resolves via the module-captured native Promise', () => {
    // withSignal has no toolbox options / resolved Impl; it must use the module-level captured
    // NativePromise const rather than the live (patched) global.
    const done = withSignal(undefined, RealPromise.resolve('ok'));

    return done.then((value) => {
      expect(value).toBe('ok');
      expect(patchedConstructed.length).toBe(0);
    });
  });

  it('default export construction still goes through CancelablePromise, unaffected by the patch', () => {
    const raced = minDelay(RealPromise.resolve('v'), 10);
    jest.runAllTimers();

    return raced.then(() => {
      expect(raced).toBeInstanceOf(CancelablePromise);
    });
  });
});
