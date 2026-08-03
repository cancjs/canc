import { CancelablePromise } from '../cancelable-promise';
import { isCancelError } from '../helpers';

/**
 * Adoption across two copies of the package loaded in one process (the dual-package hazard: a CJS
 * and an ESM copy, or two versions kept apart by a package manager). Both copies are real modules
 * with their own class object, so `value instanceof this` and `value.constructor === this` are
 * false for the other copy's instances. Recognition therefore has to fall through to the
 * Symbol.for brand on the prototype, which is the same symbol in every copy.
 *
 * The second copy is a genuine second evaluation of the module in a fresh registry, not a
 * lookalike class: a hand-rolled stand-in would prove nothing about the real prototype wiring.
 *
 * Deterministic: real microtask drains, no timers.
 */

const NativePromise = Promise;

function flush(): Promise<void> {
  return NativePromise.resolve().then(() => undefined);
}

// A second evaluation of the module, isolated from the registry entry the top-level import used.
function loadSecondCopy(): typeof CancelablePromise {
  let copy: typeof CancelablePromise | undefined;

  jest.isolateModules(() => {
    copy = (require('../cancelable-promise') as { CancelablePromise: typeof CancelablePromise }).CancelablePromise;
  });

  return copy!;
}

const OtherCopy = loadSecondCopy();

function makeInner(Impl: typeof CancelablePromise): {
  promise: CancelablePromise<number>;
  canceled: () => boolean;
} {
  let canceled = false;
  const promise = new Impl<number>((_resolve, _reject, { handleCancel }) => {
    handleCancel(() => {
      canceled = true;
    });
  });
  return { promise, canceled: () => canceled };
}

describe('two copies of the package in one process', () => {
  it('the copies are distinct classes with distinct prototypes', () => {
    expect(OtherCopy).not.toBe(CancelablePromise);
    expect(OtherCopy.prototype).not.toBe(CancelablePromise.prototype);

    const foreign = new OtherCopy<number>((resolve) => resolve(1));
    expect(foreign instanceof CancelablePromise).toBe(false);
    expect(foreign.constructor).not.toBe(CancelablePromise);
  });

  it('both copies brand their prototype with the same registry symbol', () => {
    const brand = Symbol.for('@cancjs/promise:CancelablePromise');
    expect((CancelablePromise.prototype as any)[brand]).toBe(true);
    expect((OtherCopy.prototype as any)[brand]).toBe(true);
  });
});

describe('adopting a promise from the other copy', () => {
  it('resolve() wraps it and settles with its value', async () => {
    const foreign = new OtherCopy<number>((resolve) => resolve(41));
    const wrapped = CancelablePromise.resolve(foreign);

    expect(wrapped).not.toBe(foreign);
    expect(wrapped).toBeInstanceOf(CancelablePromise);
    expect(await wrapped).toBe(41);
  });

  it('executor resolve(): canceling the wrapper cancels the adopted promise', async () => {
    const inner = makeInner(OtherCopy);
    const outer = new CancelablePromise<number>((resolve) => resolve(inner.promise));
    outer.catch(() => undefined);

    await flush();

    outer.cancel();
    await flush();

    expect(inner.canceled()).toBe(true);
    expect(inner.promise.canceled).toBe(true);
  });

  it('then() return: canceling the chain cancels the adopted promise', async () => {
    const inner = makeInner(OtherCopy);
    const outer = CancelablePromise.resolve().then(() => inner.promise);
    outer.catch(() => undefined);

    await flush();
    await flush();

    outer.cancel();
    await flush();

    expect(inner.canceled()).toBe(true);
    expect(inner.promise.canceled).toBe(true);
  });

  it('propagates in the other direction too, from the other copy to this one', async () => {
    const inner = makeInner(CancelablePromise);
    const outer = new OtherCopy<number>((resolve) => resolve(inner.promise));
    outer.catch(() => undefined);

    await flush();

    outer.cancel();
    await flush();

    expect(inner.canceled()).toBe(true);
    expect(inner.promise.canceled).toBe(true);
  });

  it('a cancellation from the other copy is caught as a cancel error here', async () => {
    const foreign = new OtherCopy<number>(() => undefined);
    const caught = foreign.catch((reason: unknown) => reason);

    foreign.cancel();

    const reason = await caught;
    expect(isCancelError(reason)).toBe(true);
  });
});
