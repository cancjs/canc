import { CancelablePromise } from './cancelable-promise';

// Guards against a future TS target bump (es2022+ defaults useDefineForClassFields:true)
// silently breaking species resolution. Under the CURRENT es5 target these fields already emit
// nothing, but the `declare` modifier makes that explicit, see comments at the static species
// field / [Symbol.toStringTag] field in cancelable-promise.ts.
describe('species regression', () => {
  it('p.then(...) returns an instance that IS instanceof CancelablePromise', () => {
    const p = new CancelablePromise<number>((resolve) => resolve(1));
    const chained = p.then(() => {
      /* noop */
    });

    expect(chained).toBeInstanceOf(CancelablePromise);
  });

  it('CancelablePromise[Symbol.species] === CancelablePromise', () => {
    // No own species getter is defined — it resolves via the inherited native
    // Promise[Symbol.species] getter (which returns `this`), reached through
    // Object.setPrototypeOf(CancelablePromise, NativePromise).
    expect((CancelablePromise as any)[Symbol.species]).toBe(CancelablePromise);
  });

  it('a subclass of CancelablePromise produces subclass instances when chaining .then()', () => {
    class MyCancelablePromise<T> extends CancelablePromise<T> {}

    const p = new MyCancelablePromise<number>((resolve) => resolve(1));
    const chained = p.then((value) => value + 1);

    expect(chained).toBeInstanceOf(MyCancelablePromise);
    expect(chained).toBeInstanceOf(CancelablePromise);

    return chained.then((value) => {
      expect(value).toBe(2);
    });
  });
});
