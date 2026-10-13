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

// one host turn: an unhandled rejection is reported to jest before the case ends
function hostTurn(): Promise<void> {
  return new NativePromise((resolve) => setImmediate(resolve));
}

interface ThenView {
  then: PromiseLike<unknown>['then'];
  cancel: jest.Mock;
}

// A copy that carries the brand and the public surface but none of this copy's private entries,
// as a future release that renamed them would look from here.
function makeBrandedWithoutPrivates<T>(): {
  foreign: PromiseLike<T> & { cancel: jest.Mock };
  views: ThenView[];
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const settled = new NativePromise<T>((resolve_) => {
    resolve = resolve_;
  });
  const views: ThenView[] = [];
  const foreign = {
    [Symbol.for('@cancjs/promise:CancelablePromise')]: true,
    then: <TFulfilled = T, TRejected = never>(
      onFulfilled?: ((value: T) => TFulfilled | PromiseLike<TFulfilled>) | null,
      onRejected?: ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null,
    ) => {
      const derived = settled.then(onFulfilled, onRejected);
      const view: ThenView = {
        then: (a, b) => derived.then(a, b),
        cancel: jest.fn(),
      };
      views.push(view);
      return view as unknown as PromiseLike<TFulfilled | TRejected>;
    },
    cancel: jest.fn(),
  };
  return { foreign, views, resolve };
}

// A brand-only face over a real promise of the other copy: adoption takes the public fallback,
// while `then` and `cancel` keep the source's real consumer counting.
function makeBrandOnlyShared<T>(): {
  source: CancelablePromise<T>;
  foreign: PromiseLike<T> & { cancel: jest.Mock };
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const source = new OtherCopy<T>((resolve_) => {
    resolve = resolve_;
  });
  const foreign = {
    [Symbol.for('@cancjs/promise:CancelablePromise')]: true,
    then: <TFulfilled = T, TRejected = never>(
      onFulfilled?: ((value: T) => TFulfilled | PromiseLike<TFulfilled>) | null,
      onRejected?: ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null,
    ) => source.then(onFulfilled, onRejected),
    cancel: jest.fn((reason?: unknown) => source.cancel(reason)),
  };
  return { source, foreign, resolve };
}

describe('adopting a branded copy without the private entries', () => {
  it('executor resolve(): the value flows through the public then', async () => {
    const { foreign, resolve } = makeBrandedWithoutPrivates<number>();
    const outer = new CancelablePromise<number>((resolve_) => resolve_(foreign));

    resolve(7);

    expect(await outer).toBe(7);
    expect(foreign.cancel).not.toHaveBeenCalled();
  });

  it('then() return: the value flows through the public then', async () => {
    const { foreign, resolve } = makeBrandedWithoutPrivates<number>();
    const outer = CancelablePromise.resolve().then(() => foreign);

    resolve(8);

    expect(await outer).toBe(8);
  });

  it('resolve() wraps it and settles with its value', async () => {
    const { foreign, resolve } = makeBrandedWithoutPrivates<number>();
    const wrapped = CancelablePromise.resolve(foreign);

    resolve(9);

    expect(await wrapped).toBe(9);
  });

  it('subscribes through the public then once', async () => {
    const { foreign, views } = makeBrandedWithoutPrivates<number>();
    const outer = new CancelablePromise<number>((resolve_) => resolve_(foreign));
    outer.catch(() => undefined);

    await flush();
    await flush();

    expect(views).toHaveLength(1);
  });

  it('canceling the wrapper cancels the then view once, never the source', async () => {
    const { foreign, views } = makeBrandedWithoutPrivates<number>();
    const outer = new CancelablePromise<number>((resolve_) => resolve_(foreign));
    const caught = outer.catch((reason: unknown) => reason);

    await flush();

    outer.cancel('stop');
    await flush();

    expect(views).toHaveLength(1);
    expect(views[0].cancel).toHaveBeenCalledTimes(1);
    expect(views[0].cancel).toHaveBeenCalledWith('stop');
    expect(foreign.cancel).toHaveBeenCalledTimes(0);
    expect(isCancelError(await caught)).toBe(true);
    await hostTurn();
  });

  it('then() return: canceling the chain cancels the then view, never the source', async () => {
    const { foreign, views } = makeBrandedWithoutPrivates<number>();
    const outer = CancelablePromise.resolve().then(() => foreign);
    const caught = outer.catch((reason: unknown) => reason);

    await flush();
    await flush();
    await flush();

    outer.cancel('stop');
    await flush();

    expect(views).toHaveLength(1);
    expect(views[0].cancel).toHaveBeenCalledTimes(1);
    expect(views[0].cancel).toHaveBeenCalledWith('stop');
    expect(foreign.cancel).toHaveBeenCalledTimes(0);
    expect(isCancelError(await caught)).toBe(true);
    await hostTurn();
  });

  it('forceCancelable false: the then view is kept and the value still flows', async () => {
    const { foreign, views, resolve } = makeBrandedWithoutPrivates<number>();
    const outer = new CancelablePromise<number>((resolve_) => resolve_(foreign), { forceCancelable: false });

    resolve(6);

    expect(await outer).toBe(6);
    expect(views).toHaveLength(1);
    expect(views[0].cancel).toHaveBeenCalledTimes(0);
    expect(foreign.cancel).toHaveBeenCalledTimes(0);
  });

  it('a then view without cancel leaves the source alone', async () => {
    const { foreign } = makeBrandedWithoutPrivates<number>();
    const bare = {
      [Symbol.for('@cancjs/promise:CancelablePromise')]: true,
      then: jest.fn(() => undefined),
      cancel: foreign.cancel,
    } as unknown as PromiseLike<number>;
    const outer = new CancelablePromise<number>((resolve_) => resolve_(bare));
    const caught = outer.catch((reason: unknown) => reason);

    await flush();

    expect(() => outer.cancel()).not.toThrow();
    expect(bare.then).toHaveBeenCalledTimes(1);
    expect(foreign.cancel).toHaveBeenCalledTimes(0);
    expect(isCancelError(await caught)).toBe(true);
    await hostTurn();
  });

  it('a cancel before the then view exists reaches the view once it does', async () => {
    const { foreign, views } = makeBrandedWithoutPrivates<number>();
    const outer = new CancelablePromise<number>((resolve_) => resolve_(foreign));
    const caught = outer.catch((reason: unknown) => reason);

    outer.cancel('early');
    await flush();
    await flush();

    expect(views).toHaveLength(1);
    expect(views[0].cancel).toHaveBeenCalledTimes(1);
    expect(views[0].cancel).toHaveBeenCalledWith('early');
    expect(foreign.cancel).toHaveBeenCalledTimes(0);
    expect(isCancelError(await caught)).toBe(true);
    await hostTurn();
  });

  it('a throwing view cancel does not break the wrapper cancellation', async () => {
    const { foreign, views } = makeBrandedWithoutPrivates<number>();
    const outer = new CancelablePromise<number>((resolve_) => resolve_(foreign));
    const caught = outer.catch((reason: unknown) => reason);

    await flush();
    views[0].cancel.mockImplementation(() => {
      throw new Error('settled');
    });

    expect(() => outer.cancel()).not.toThrow();
    expect(views[0].cancel).toHaveBeenCalledTimes(1);
    expect(foreign.cancel).toHaveBeenCalledTimes(0);
    expect(isCancelError(await caught)).toBe(true);
    await hostTurn();
  });

  it('a shared source with a second live consumer keeps its value', async () => {
    const { source, foreign, resolve } = makeBrandOnlyShared<number>();
    const other = source.then((value) => value);
    const outer = new CancelablePromise<number>((resolve_) => resolve_(foreign));
    const caught = outer.catch((reason: unknown) => reason);

    await flush();

    outer.cancel();
    resolve(5);

    expect(isCancelError(await caught)).toBe(true);
    expect(await other).toBe(5);
    expect(source.canceled).toBe(false);
    expect(foreign.cancel).toHaveBeenCalledTimes(0);
    await hostTurn();
  });
});
