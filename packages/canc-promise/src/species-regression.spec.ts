import { CancelablePromise } from './cancelable-promise';

// Species resolution regression suite: guards against target changes (es2022+) breaking subclassing
// by enforcing declare on class fields as documented in cancelable-promise.ts
describe('species regression', () => {
  it('p.then(...) returns an instance that IS instanceof CancelablePromise', () => {
    const p = new CancelablePromise<number>((resolve) => resolve(1));
    const chained = p.then(() => {
      /* noop */
    });

    expect(chained).toBeInstanceOf(CancelablePromise);
  });

  it('CancelablePromise[Symbol.species] === CancelablePromise', () => {
    // resolves via inherited native Promise[Symbol.species] getter returning this
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
