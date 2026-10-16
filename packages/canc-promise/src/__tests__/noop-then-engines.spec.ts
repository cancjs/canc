import type { CancelablePromise } from '../cancelable-promise';
import { isCancelError } from '../helpers';

// es6-promise, promise-polyfill and zone.js build a then child with one shared noop executor
// and settle it internally; each case loads a fresh core while one of them is the global Promise

const NativePromise = Promise;

type TSettle = (value?: unknown) => void;
type TExecutor = (resolve: TSettle, reject: TSettle) => void;
type THandler = ((value: unknown) => unknown) | null | undefined;

const PENDING = 0;
const FULFILLED = 1;
const REJECTED = 2;

function isObjectLike(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

interface INoopStyleState {
  __state?: number;
  __value?: unknown;
  __reactions?: { onFulfilled: THandler; onRejected: THandler; child: INoopStyleState }[] | null;
}

// es6-promise shape: es5 function, string-keyed state, the constructor skips the shared noop
function createNoopStylePromise(): PromiseConstructor {
  const enqueue = queueMicrotask;
  function NOOP(): void {}

  function initState(promise: INoopStyleState): void {
    promise.__state = PENDING;
    promise.__value = undefined;
    promise.__reactions = [];
  }

  function runReaction(
    parent: INoopStyleState,
    reaction: { onFulfilled: THandler; onRejected: THandler; child: INoopStyleState },
  ): void {
    enqueue(() => {
      const handler = parent.__state === FULFILLED ? reaction.onFulfilled : reaction.onRejected;
      if (typeof handler !== 'function') {
        if (parent.__state === FULFILLED) {
          resolvePromise(reaction.child, parent.__value);
        } else {
          settle(reaction.child, REJECTED, parent.__value);
        }
        return;
      }
      let result: unknown;
      try {
        result = handler(parent.__value);
      } catch (error) {
        settle(reaction.child, REJECTED, error);
        return;
      }
      resolvePromise(reaction.child, result);
    });
  }

  function settle(promise: INoopStyleState, state: number, value: unknown): void {
    if (promise.__state !== PENDING) {
      return;
    }
    promise.__state = state;
    promise.__value = value;
    const reactions = promise.__reactions!;
    promise.__reactions = null;
    for (const reaction of reactions) {
      runReaction(promise, reaction);
    }
  }

  function resolvePromise(promise: INoopStyleState, value: unknown): void {
    if (value === promise) {
      settle(promise, REJECTED, new TypeError('A promise cannot resolve to itself'));
      return;
    }
    if (isObjectLike(value)) {
      let then: unknown;
      try {
        then = (value as { then?: unknown }).then;
      } catch (error) {
        settle(promise, REJECTED, error);
        return;
      }
      if (typeof then === 'function') {
        enqueue(() => {
          let called = false;
          try {
            then.call(
              value,
              (inner: unknown) => {
                if (!called) {
                  called = true;
                  resolvePromise(promise, inner);
                }
              },
              (reason: unknown) => {
                if (!called) {
                  called = true;
                  settle(promise, REJECTED, reason);
                }
              },
            );
          } catch (error) {
            if (!called) {
              called = true;
              settle(promise, REJECTED, error);
            }
          }
        });
        return;
      }
    }
    settle(promise, FULFILLED, value);
  }

  function NoopStylePromise(this: INoopStyleState, resolver: TExecutor): void {
    if ((resolver as unknown) === NOOP) {
      initState(this);
      return;
    }
    if (!(this instanceof NoopStylePromise)) {
      throw new TypeError('Promise must be called with new');
    }
    initState(this);
    let done = false;
    try {
      resolver(
        (value) => {
          if (!done) {
            done = true;
            resolvePromise(this, value);
          }
        },
        (reason) => {
          if (!done) {
            done = true;
            settle(this, REJECTED, reason);
          }
        },
      );
    } catch (error) {
      if (!done) {
        done = true;
        settle(this, REJECTED, error);
      }
    }
  }

  NoopStylePromise.prototype.then = function (
    this: INoopStyleState,
    onFulfilled: THandler,
    onRejected: THandler,
  ): INoopStyleState {
    const Constructor = this.constructor as new (resolver: unknown) => INoopStyleState;
    const child = new Constructor(NOOP);
    if (child.__reactions === undefined) {
      initState(child);
    }
    const reaction = { onFulfilled, onRejected, child };
    if (this.__state === PENDING) {
      this.__reactions!.push(reaction);
    } else {
      runReaction(this, reaction);
    }
    return child;
  };

  NoopStylePromise.prototype.catch = function (this: PromiseLike<unknown>, onRejected: THandler) {
    return this.then(undefined, onRejected);
  };

  const statics = NoopStylePromise as unknown as {
    new (resolver: unknown): INoopStyleState;
    resolve(value?: unknown): unknown;
    reject(reason?: unknown): unknown;
    all(values: unknown[]): unknown;
  };

  statics.resolve = function (this: typeof statics, value?: unknown) {
    if (isObjectLike(value) && value.constructor === this) {
      return value;
    }
    const promise = new this(NOOP);
    resolvePromise(promise, value);
    return promise;
  };

  statics.reject = function (this: typeof statics, reason?: unknown) {
    const promise = new this(NOOP);
    settle(promise, REJECTED, reason);
    return promise;
  };

  statics.all = function (this: typeof statics, values: unknown[]) {
    const promise = new this(NOOP);
    const results: unknown[] = new Array(values.length);
    let left = values.length;
    if (!left) {
      settle(promise, FULFILLED, results);
    }
    values.forEach((value, index) => {
      (this.resolve(value) as PromiseLike<unknown>).then(
        (result) => {
          results[index] = result;
          if (--left === 0) {
            settle(promise, FULFILLED, results);
          }
        },
        (reason) => settle(promise, REJECTED, reason),
      );
    });
    return promise;
  };

  return NoopStylePromise as unknown as PromiseConstructor;
}

// zone.js ZoneAwarePromise shape: class, symbol-keyed state, species as an INSTANCE getter so
// the static read on a subclass falls back to this.constructor, child built with a shared noop
function createZoneShapedPromise(): PromiseConstructor {
  const enqueue = queueMicrotask;
  const symbolState = Symbol('state');
  const symbolValue = Symbol('value');
  const UNRESOLVED = null;
  function noop(): void {}

  interface IZoneState {
    [symbolState]: boolean | null;
    [symbolValue]: unknown;
  }

  function scheduleResolveOrReject(
    promise: IZoneState,
    chainPromise: IZoneState,
    onFulfilled: THandler,
    onRejected: THandler,
  ): void {
    enqueue(() => {
      const fulfilled = promise[symbolState] === true;
      const handler = fulfilled ? onFulfilled : onRejected;
      if (typeof handler !== 'function') {
        resolvePromise(chainPromise, fulfilled, promise[symbolValue]);
        return;
      }
      try {
        resolvePromise(chainPromise, true, handler(promise[symbolValue]));
      } catch (error) {
        resolvePromise(chainPromise, false, error);
      }
    });
  }

  function makeResolver(promise: IZoneState, state: boolean): TSettle {
    let called = false;
    return (value) => {
      if (!called) {
        called = true;
        resolvePromise(promise, state, value);
      }
    };
  }

  function resolvePromise(promise: IZoneState, state: boolean, value: unknown): void {
    if (promise[symbolState] !== UNRESOLVED) {
      return;
    }
    if (state && isObjectLike(value)) {
      let then: unknown;
      try {
        then = (value as { then?: unknown }).then;
      } catch (error) {
        resolvePromise(promise, false, error);
        return;
      }
      if (typeof then === 'function') {
        try {
          then.call(value, makeResolver(promise, true), makeResolver(promise, false));
        } catch (error) {
          makeResolver(promise, false)(error);
        }
        return;
      }
    }
    const queue = promise[symbolValue] as unknown[];
    promise[symbolState] = state;
    promise[symbolValue] = value;
    for (let i = 0; i < queue.length; i += 3) {
      scheduleResolveOrReject(promise, queue[i] as IZoneState, queue[i + 1] as THandler, queue[i + 2] as THandler);
    }
  }

  class ZoneShapedPromise implements IZoneState {
    static resolve(value?: unknown): unknown {
      if (value instanceof ZoneShapedPromise) {
        return value;
      }
      const promise = new this(noop);
      resolvePromise(promise, true, value);
      return promise;
    }

    static reject(reason?: unknown): unknown {
      const promise = new this(noop);
      resolvePromise(promise, false, reason);
      return promise;
    }

    static all(values: unknown[]): unknown {
      return new this((resolve, reject) => {
        const results: unknown[] = new Array(values.length);
        let left = values.length;
        if (!left) {
          resolve(results);
        }
        values.forEach((value, index) => {
          (this.resolve(value) as PromiseLike<unknown>).then((result) => {
            results[index] = result;
            if (--left === 0) {
              resolve(results);
            }
          }, reject);
        });
      });
    }

    [symbolState]: boolean | null;
    [symbolValue]: unknown;

    constructor(executor: TExecutor) {
      if (!(this instanceof ZoneShapedPromise)) {
        throw new Error('Must be an instanceof Promise.');
      }
      this[symbolState] = UNRESOLVED;
      this[symbolValue] = [];
      try {
        executor(makeResolver(this, true), makeResolver(this, false));
      } catch (error) {
        resolvePromise(this, false, error);
      }
    }

    get [Symbol.species](): typeof ZoneShapedPromise {
      return ZoneShapedPromise;
    }

    then(onFulfilled?: THandler, onRejected?: THandler): IZoneState {
      const ctor = this.constructor as (new (executor: TExecutor) => IZoneState) | undefined;
      let Species = (ctor as { [Symbol.species]?: unknown } | undefined)?.[Symbol.species];
      if (typeof Species !== 'function') {
        Species = ctor || ZoneShapedPromise;
      }
      const chainPromise = new (Species as new (executor: TExecutor) => IZoneState)(noop);
      if (this[symbolState] === UNRESOLVED) {
        (this[symbolValue] as unknown[]).push(chainPromise, onFulfilled, onRejected);
      } else {
        scheduleResolveOrReject(this, chainPromise, onFulfilled, onRejected);
      }
      return chainPromise;
    }

    catch(onRejected?: THandler): IZoneState {
      return this.then(undefined, onRejected);
    }
  }

  return ZoneShapedPromise as unknown as PromiseConstructor;
}

function loadCoreOver(PromiseImpl: PromiseConstructor): typeof CancelablePromise {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Promise')!;
  let Core: typeof CancelablePromise | undefined;
  try {
    Object.defineProperty(globalThis, 'Promise', { ...descriptor, value: PromiseImpl });
    jest.isolateModules(() => {
      Core = (require('../cancelable-promise') as { CancelablePromise: typeof CancelablePromise }).CancelablePromise;
    });
  } finally {
    Object.defineProperty(globalThis, 'Promise', descriptor);
  }
  return Core!;
}

function outcome(promise: PromiseLike<unknown>): Promise<{ fulfilled: boolean; value: unknown }> {
  return new NativePromise((resolve) => {
    promise.then(
      (value) => resolve({ fulfilled: true, value }),
      (value) => resolve({ fulfilled: false, value }),
    );
  });
}

describe.each([
  ['an es5 polyfill with a noop then executor', createNoopStylePromise],
  ['a zone.js shaped Promise', createZoneShapedPromise],
])('then children over %s', (_name, createPromise) => {
  let Core: typeof CancelablePromise;

  beforeEach(() => {
    Core = loadCoreOver(createPromise());
  });

  it('cancel flows down to a then child', async () => {
    const parent = new Core<void>(() => undefined);
    const child = parent.then(() => 'never');
    const settled = outcome(child);

    void parent.cancel();
    const result = await settled;

    expect(result.fulfilled).toBe(false);
    expect(isCancelError(result.value)).toBe(true);
    expect(child.canceled).toBe(true);
  });

  it('a then child leaves the cancelable state once it settles', async () => {
    const child = new Core<number>((resolve) => resolve(1)).then((value) => value + 1);

    expect(await outcome(child)).toEqual({ fulfilled: true, value: 2 });
    expect(child.cancelable).toBe(false);
    expect(child.canceled).toBe(false);
  });

  it('cancel after a then child settles is a no-op', async () => {
    const child = new Core<number>((resolve) => resolve(1)).then((value) => value);
    await outcome(child);
    let fired = 0;

    child.handleCancel(() => {
      fired++;
    });
    void child.cancel();

    expect(fired).toBe(0);
    expect(child.canceled).toBe(false);
  });

  it('a rejection handler recovers the child and a throwing handler rejects it', async () => {
    const failure = new Error('boom');
    const recovered = new Core<number>((_resolve, reject) => reject(failure)).then(undefined, () => 'recovered');
    const thrown = new Core<number>((resolve) => resolve(1)).then(() => {
      throw failure;
    });

    expect(await outcome(recovered)).toEqual({ fulfilled: true, value: 'recovered' });
    expect(await outcome(thrown)).toEqual({ fulfilled: false, value: failure });
    expect(thrown.canceled).toBe(false);
  });

  it('canceling the only then child bubbles to the parent', async () => {
    let parentCanceled = false;
    const parent = new Core<void>((_resolve, _reject, { handleCancel }) => {
      handleCancel(() => {
        parentCanceled = true;
      });
    });
    const child = parent.then();

    await child.cancel();

    expect(child.canceled).toBe(true);
    expect(parentCanceled).toBe(true);
  });
});

describe('then children over the native Promise', () => {
  it('builds the child through the native then', async () => {
    const Core = loadCoreOver(NativePromise);
    const parent = Core.resolve(1);
    const thenSpy = jest.spyOn(NativePromise.prototype, 'then');
    let child: CancelablePromise<number>;
    let returnedOnParent: unknown[];
    try {
      child = parent.then((value) => value + 1);
      returnedOnParent = thenSpy.mock.results
        .filter((_result, index) => thenSpy.mock.contexts[index] === parent)
        .map((result) => result.value as unknown);
    } finally {
      thenSpy.mockRestore();
    }

    expect(returnedOnParent).toContain(child);
    expect(await child).toBe(2);
    expect(child.cancelable).toBe(false);
  });
});
