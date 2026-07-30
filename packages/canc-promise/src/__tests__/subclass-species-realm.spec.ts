import vm from 'vm';

import { CANCEL_ERROR_BRAND, CancelError } from '../cancel-error';
import { CancelablePromise } from '../cancelable-promise';
import { isCancelError } from '../helpers';

/**
 * Subclass / species / realm.
 *
 * Covers:
 * - class Sub extends CancelablePromise: then/catch/finally/all/allSettled/any/race/resolve/reject
 * return Sub instances (species = the constructor, resolved via the inherited native
 * Promise[Symbol.species] getter through Object.setPrototypeOf(CancelablePromise, NativePromise)).
 * - species identity (CancelablePromise[Symbol.species] === CancelablePromise; Sub[Symbol.species]
 * === Sub).
 * - Symbol.toStringTag / Object.prototype.toString.call(p) === '[object Promise]' (inherited
 * native getter, declare-only field emits nothing under es5 target).
 * - instanceof chains: Sub -> CancelablePromise -> Promise.
 * - native interop: await a canc promise in a native async fn, Promise.resolve(canc) adoption,
 * Promise.all over canc inputs.
 * - cross-realm CancelError recognition via Symbol.for brand (duck-typing proof) using node vm.
 *
 * All deterministic: real awaits on already-scheduled microtasks, no timers/sleeps.
 */

const NativePromise = Promise;

// A subclass exercising species resolution on the derivation path.
class Sub<T> extends CancelablePromise<T> {}

describe('species identity', () => {
  it('CancelablePromise[Symbol.species] === CancelablePromise', () => {
    // No own species getter — resolves via inherited native Promise[Symbol.species] (returns
    // `this`) reached through Object.setPrototypeOf(CancelablePromise, NativePromise).
    expect((CancelablePromise as any)[Symbol.species]).toBe(CancelablePromise);
  });

  it('Sub[Symbol.species] === Sub (subclass sees itself as species)', () => {
    expect((Sub as any)[Symbol.species]).toBe(Sub);
  });

  it('CancelablePromise inherits native Promise as its constructor prototype', () => {
    expect(Object.getPrototypeOf(CancelablePromise)).toBe(NativePromise);
  });
});

describe('subclass derivation returns Sub instances', () => {
  it('new Sub(...) is a Sub, a CancelablePromise, and a native Promise', async () => {
    const p = new Sub<number>((resolve) => resolve(1));
    expect(p).toBeInstanceOf(Sub);
    expect(p).toBeInstanceOf(CancelablePromise);
    expect(p).toBeInstanceOf(NativePromise);
    expect(await p).toBe(1);
  });

  it('Sub.prototype.then(...) returns a Sub', async () => {
    const p = new Sub<number>((resolve) => resolve(1));
    const chained = p.then((v) => v + 1);
    expect(chained).toBeInstanceOf(Sub);
    expect(chained).toBeInstanceOf(CancelablePromise);
    expect(await chained).toBe(2);
  });

  it('Sub.prototype.catch(...) returns a Sub', async () => {
    const p = new Sub<number>((_r, reject) => reject(new Error('boom')));
    const chained = p.catch(() => 7);
    expect(chained).toBeInstanceOf(Sub);
    expect(await chained).toBe(7);
  });

  it('Sub.prototype.finally(...) returns a Sub', async () => {
    const p = new Sub<number>((resolve) => resolve(5));
    const chained = p.finally(() => {
      /* noop */
    });
    expect(chained).toBeInstanceOf(Sub);
    expect(await chained).toBe(5);
  });

  it('Sub.resolve(value) returns a Sub', async () => {
    const p = Sub.resolve(42);
    expect(p).toBeInstanceOf(Sub);
    expect(p).toBeInstanceOf(CancelablePromise);
    expect(await p).toBe(42);
  });

  it('Sub.reject(reason) returns a Sub', async () => {
    const p = Sub.reject(new Error('nope'));
    expect(p).toBeInstanceOf(Sub);
    await expect(p).rejects.toThrow('nope');
  });

  it('Sub.all(...) returns a Sub resolving to the value array', async () => {
    const p = Sub.all([1, NativePromise.resolve(2), Sub.resolve(3)]);
    expect(p).toBeInstanceOf(Sub);
    expect(await p).toEqual([1, 2, 3]);
  });

  it('Sub.allSettled(...) returns a Sub', async () => {
    const p = Sub.allSettled([Sub.resolve(1), Sub.reject(new Error('x'))]);
    expect(p).toBeInstanceOf(Sub);
    const results = await p;
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1].status).toBe('rejected');
  });

  it('Sub.any(...) returns a Sub', async () => {
    const p = Sub.any([Sub.reject(new Error('a')), Sub.resolve('win')]);
    expect(p).toBeInstanceOf(Sub);
    expect(await p).toBe('win');
  });

  it('Sub.race(...) returns a Sub', async () => {
    const p = Sub.race([
      Sub.resolve('first'),
      new NativePromise(() => {
        /* never */
      }),
    ]);
    expect(p).toBeInstanceOf(Sub);
    expect(await p).toBe('first');
  });

  it('Sub.withResolvers() returns a Sub promise', async () => {
    const { promise, resolve } = Sub.withResolvers<number>();
    expect(promise).toBeInstanceOf(Sub);
    resolve(9);
    expect(await promise).toBe(9);
  });
});

describe('CancelablePromise base derivation returns CancelablePromise instances', () => {
  it('CancelablePromise.resolve(value).then(...) chains stay CancelablePromise', async () => {
    const p = CancelablePromise.resolve(1)
      .then((v) => v + 1)
      .catch(() => 0)
      .finally(() => {
        /**/
      });
    expect(p).toBeInstanceOf(CancelablePromise);
    expect(await p).toBe(2);
  });

  it('CancelablePromise.resolve returns the same instance for an own-constructor instance (Promise.resolve parity)', () => {
    const original = new CancelablePromise<number>((resolve) => resolve(1));
    expect(CancelablePromise.resolve(original)).toBe(original);
  });

  it('Sub.resolve does NOT return a base CancelablePromise unchanged (constructor mismatch rewraps)', async () => {
    const base = new CancelablePromise<number>((resolve) => resolve(1));
    const wrapped = Sub.resolve(base);
    expect(wrapped).not.toBe(base);
    expect(wrapped).toBeInstanceOf(Sub);
    expect(await wrapped).toBe(1);
  });
});

describe('toStringTag / Object.prototype.toString', () => {
  it('Object.prototype.toString.call(cancelable) === "[object Promise]"', () => {
    const p = new CancelablePromise<void>((resolve) => resolve());
    expect(Object.prototype.toString.call(p)).toBe('[object Promise]');
    return p;
  });

  it('Object.prototype.toString.call(subInstance) === "[object Promise]"', () => {
    const p = new Sub<void>((resolve) => resolve());
    expect(Object.prototype.toString.call(p)).toBe('[object Promise]');
    return p;
  });

  it('instance[Symbol.toStringTag] is the inherited native "Promise" tag', () => {
    const p = new CancelablePromise<void>((resolve) => resolve());
    expect((p as any)[Symbol.toStringTag]).toBe('Promise');
    return p;
  });

  it('the class defines no OWN [Symbol.toStringTag] property (declare-only)', () => {
    const p = new CancelablePromise<void>((resolve) => resolve());
    expect(Object.prototype.hasOwnProperty.call(p, Symbol.toStringTag)).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(CancelablePromise.prototype, Symbol.toStringTag)).toBe(false);
    return p;
  });
});

describe('instanceof chains', () => {
  it('Sub instance walks the full prototype chain Sub -> CancelablePromise -> Promise', () => {
    const p = new Sub<void>((resolve) => resolve());
    const proto = Object.getPrototypeOf(p);
    expect(proto).toBe(Sub.prototype);
    expect(Object.getPrototypeOf(Sub.prototype)).toBe(CancelablePromise.prototype);
    expect(Object.getPrototypeOf(CancelablePromise.prototype)).toBe(NativePromise.prototype);
    return p;
  });

  it('a base CancelablePromise is NOT an instanceof Sub', () => {
    const p = new CancelablePromise<void>((resolve) => resolve());
    expect(p).not.toBeInstanceOf(Sub);
    return p;
  });
});

describe('native interop', () => {
  it('await-ing a cancelable promise inside a native async function yields its value', async () => {
    const canc = new CancelablePromise<string>((resolve) => resolve('hi'));
    const nativeAsync = async () => {
      const v = await canc; // native await adopts the thenable
      return v + '!';
    };
    expect(await nativeAsync()).toBe('hi!');
  });

  it('Promise.resolve(cancelable) adopts it (native Promise, resolves to same value)', async () => {
    const canc = new CancelablePromise<number>((resolve) => resolve(11));
    const adopted = NativePromise.resolve(canc);
    expect(adopted).toBeInstanceOf(NativePromise);
    // Native Promise.resolve on a same-constructor promise returns it as-is only when the arg's
    // constructor is Promise; a cancelable is a foreign subclass, so it is adopted, not returned.
    expect(await adopted).toBe(11);
  });

  it('Promise.all over cancelable inputs resolves to the value array (native combinator)', async () => {
    const inputs = [
      new CancelablePromise<number>((resolve) => resolve(1)),
      new CancelablePromise<number>((resolve) => resolve(2)),
      new Sub<number>((resolve) => resolve(3)),
    ];
    const combined = NativePromise.all(inputs);
    expect(combined).toBeInstanceOf(NativePromise);
    expect(await combined).toEqual([1, 2, 3]);
  });

  it('Promise.race over cancelable inputs settles with the first (native combinator)', async () => {
    const winner = new CancelablePromise<string>((resolve) => resolve('go'));
    const loser = new CancelablePromise<string>(() => {
      /* never */
    });
    expect(await NativePromise.race([winner, loser])).toBe('go');
  });

  it('a rejected cancelable is caught by a native async try/catch', async () => {
    const canc = new CancelablePromise<never>((_r, reject) => reject(new Error('bang')));
    let caught: any;
    try {
      await canc;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe('bang');
  });

  it('a canceled cancelable surfaces a CancelError to a native async try/catch', async () => {
    const canc = new CancelablePromise<never>(() => {
      /* pending */
    });
    canc.cancel('stop');
    let caught: any;
    try {
      await canc;
    } catch (e) {
      caught = e;
    }
    expect(isCancelError(caught)).toBe(true);
    expect(caught).toBeInstanceOf(CancelError);
  });
});

describe('cross-realm CancelError recognition (duck-typing)', () => {
  it('recognizes a CancelError branded in another vm realm via Symbol.for', () => {
    // Symbol.for('@cancjs/promise:CancelError') resolves to the SAME symbol in every realm
    // (global symbol registry), so the brand is cross-realm immune by construction.
    const foreignBranded = vm.runInNewContext(`
			const err = new Error('cross-realm cancel');
			err.name = 'CancelError';
			err[Symbol.for('@cancjs/promise:CancelError')] = true;
			err;
		`);

    // Genuinely foreign: not our CancelError instance (different realm's Error), yet branded.
    expect(foreignBranded instanceof CancelError).toBe(false);
    expect(foreignBranded instanceof Error).toBe(false); // cross-realm Error identity differs
    expect(isCancelError(foreignBranded)).toBe(true);
  });

  it('does NOT recognize a foreign CancelError-named error lacking the brand', () => {
    const impostor = vm.runInNewContext(`
			const err = new Error('impostor');
			err.name = 'CancelError';
			err;
		`);
    expect(isCancelError(impostor)).toBe(false);
  });

  it('the local CANCEL_ERROR_BRAND symbol equals the cross-realm Symbol.for registry entry', () => {
    const foreignSymbol = vm.runInNewContext(`Symbol.for('@cancjs/promise:CancelError')`);
    expect(foreignSymbol).toBe(CANCEL_ERROR_BRAND);
  });

  it('a cross-realm branded error cancels a local promise and is caught as a CancelError', async () => {
    const foreignBranded = vm.runInNewContext(`
			const err = new Error('realm cancel');
			err.name = 'CancelError';
			err[Symbol.for('@cancjs/promise:CancelError')] = true;
			err;
		`);
    const canc = new CancelablePromise<never>(() => {
      /* pending */
    });
    canc.cancel(foreignBranded);

    const settled: any = await canc.catch((e) => e);
    // Brand passthrough: a branded reason is treated as an existing CancelError and passes
    // through unwrapped, so the caught error IS the foreign object.
    expect(settled).toBe(foreignBranded);
    expect(isCancelError(settled)).toBe(true);
    expect(canc.isCanceled).toBe(true);
  });
});
