import { getEventListeners } from 'node:events';

import { isThenable } from '../../_util';
import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';

function preAbortedSignal(): AbortSignal {
  const controller = new AbortController();
  controller.abort(new Error('gone'));
  return controller.signal;
}

// attached up front: a failing sync check would otherwise leave the rejection unhandled
function handled<T>(promise: CancelablePromise<T>): CancelablePromise<T> {
  promise.catch(() => undefined);
  return promise;
}

function pendingNative<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('executor throw', () => {
  it('leaves the promise rejected and no longer cancelable', async () => {
    const error = new Error('boom');
    const promise = handled(
      new CancelablePromise<number>(() => {
        throw error;
      }),
    );

    expect(promise.cancelable).toBe(false);
    expect(promise.canceled).toBe(false);
    await expect(promise).rejects.toBe(error);
  });

  it('ignores a later cancel, cancel handlers do not run', async () => {
    const onCancel = jest.fn();
    const promise = handled(
      new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
        handleCancel(onCancel);
        throw new Error('boom');
      }),
    );

    void promise.cancel('late');

    expect(promise.canceled).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
    await expect(promise).rejects.toThrow('boom');
  });

  it('leaves no abort listener on the signal once settled', async () => {
    const controller = new AbortController();
    const promise = handled(
      new CancelablePromise<number>(
        () => {
          throw new Error('boom');
        },
        { signal: controller.signal },
      ),
    );

    await expect(promise).rejects.toThrow('boom');
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('of a CancelError cancels the promise and runs cancel handlers', async () => {
    const onCancel = jest.fn();
    const error = new CancelError('stop');
    const promise = handled(
      new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
        handleCancel(onCancel);
        throw error;
      }),
    );

    expect(promise.canceled).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
    await expect(promise).rejects.toBe(error);
  });

  it('after resolve keeps the resolved value', async () => {
    const promise = new CancelablePromise<number>((resolve) => {
      resolve(1);
      throw new Error('ignored');
    });

    await expect(promise).resolves.toBe(1);
    expect(promise.canceled).toBe(false);
  });
});

describe('settlers of a promise born canceled by a pre-aborted signal', () => {
  it('ignore an immediate withResolvers resolve', async () => {
    const { promise, resolve } = CancelablePromise.withResolvers<number>({ signal: preAbortedSignal() });

    resolve(42);

    expect(promise.canceled).toBe(true);
    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });

  it('ignore an immediate withResolvers reject', async () => {
    const { promise, reject } = CancelablePromise.withResolvers<number>({ signal: preAbortedSignal() });

    reject(new Error('mine'));

    expect(promise.canceled).toBe(true);
    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });

  it('keep all over no inputs canceled', async () => {
    const promise = CancelablePromise.all([], { signal: preAbortedSignal() });

    expect(promise.canceled).toBe(true);
    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });

  it('keep allSettled over no inputs canceled', async () => {
    const promise = CancelablePromise.allSettled([], { signal: preAbortedSignal() });

    expect(promise.canceled).toBe(true);
    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });

  it('keep any over no inputs canceled', async () => {
    const promise = CancelablePromise.any([], { signal: preAbortedSignal() });

    expect(promise.canceled).toBe(true);
    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });
});

describe('settlers after cancel', () => {
  it('are ignored while cancel still rejects the promise', async () => {
    const { promise, resolve, cancel } = CancelablePromise.withResolvers<number>();

    void cancel('stop');
    resolve(1);

    expect(promise.canceled).toBe(true);
    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });
});

describe('settlers after adopting with forceCancelable off', () => {
  it('are ignored, the adopted value wins', async () => {
    const promise = new CancelablePromise<number>(
      (resolve, reject) => {
        resolve(Promise.resolve(1));
        resolve(2);
        reject(new Error('late'));
      },
      { forceCancelable: false },
    );

    await expect(promise).resolves.toBe(1);
  });
});

describe('resolve with a pending thenable', () => {
  it('ignores later resolve and reject calls in the executor, the thenable value wins', async () => {
    const source = pendingNative<number>();
    const promise = new CancelablePromise<number>((resolve, reject) => {
      resolve(source.promise);
      resolve(1);
      reject(new Error('late'));
    });

    source.resolve(2);

    await expect(promise).resolves.toBe(2);
  });

  it('ignores later withResolvers settlers, the thenable value wins', async () => {
    const source = pendingNative<number>();
    const { promise, resolve, reject } = CancelablePromise.withResolvers<number>();

    resolve(source.promise);
    resolve(1);
    reject(new Error('late'));
    source.resolve(2);

    await expect(promise).resolves.toBe(2);
  });

  it('stays pending and cancelable after a later reject', async () => {
    const source = pendingNative<number>();
    const { promise, resolve, reject } = CancelablePromise.withResolvers<number>();
    handled(promise);

    resolve(source.promise);
    reject(new Error('late'));

    expect(promise.cancelable).toBe(true);
    source.resolve(2);
    await expect(promise).resolves.toBe(2);
  });

  it('takes the rejection of the thenable over a later resolve', async () => {
    const source = pendingNative<number>();
    const error = new Error('adopted');
    const promise = handled(
      new CancelablePromise<number>((resolve) => {
        resolve(source.promise);
        resolve(1);
      }),
    );

    source.reject(error);

    await expect(promise).rejects.toBe(error);
  });

  it('ignores later settlers while adopting a cancelable, its value wins', async () => {
    const source = CancelablePromise.withResolvers<number>();
    const promise = new CancelablePromise<number>((resolve, reject) => {
      resolve(source.promise);
      resolve(1);
      reject(new Error('late'));
    });

    source.resolve(2);

    await expect(promise).resolves.toBe(2);
  });

  it('links a cancelable passed twice only once', () => {
    const source = CancelablePromise.withResolvers<number>();
    const promise = new CancelablePromise<number>((resolve) => {
      resolve(source.promise);
      resolve(source.promise);
    });

    expect(promise.cancelable).toBe(true);
    expect((source.promise as any)._chainsCount).toBe(1);
  });

  it('can still be canceled while adopting', async () => {
    const source = pendingNative<number>();
    const onCancel = jest.fn();
    const promise = handled(
      new CancelablePromise<number>((resolve, _reject, { handleCancel }) => {
        handleCancel(onCancel);
        resolve(source.promise);
      }),
    );

    void promise.cancel('stop');
    source.resolve(2);

    expect(promise.canceled).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });

  it('can still be canceled after a dropped reject', async () => {
    const source = pendingNative<number>();
    const { promise, resolve, reject, cancel } = CancelablePromise.withResolvers<number>();
    handled(promise);

    resolve(source.promise);
    reject(new Error('late'));
    void cancel('stop');

    expect(promise.canceled).toBe(true);
    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });

  it('still rejects when the then of the thenable throws', async () => {
    const error = new Error('then threw');
    const promise = handled(
      new CancelablePromise<number>((resolve) => {
        resolve({
          then() {
            throw error;
          },
        });
      }),
    );

    await expect(promise).rejects.toBe(error);
  });
});

const NativePromise = Promise;

type TForeignThen<T> = (onFulfilled: (value: T) => void, onRejected: (reason: unknown) => void) => void;

// a plain thenable with a loose `then`, as third-party code writes them
function foreignThenable<T>(then: TForeignThen<T>): PromiseLike<T> {
  return { then } as unknown as PromiseLike<T>;
}

async function drainMicrotasks(turns = 10): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await NativePromise.resolve();
  }
}

// one host turn: an unhandled rejection is reported to jest before the case ends
function hostTurn(): Promise<void> {
  return new NativePromise((resolve) => setImmediate(resolve));
}

function countingThenable<T>(value: T): { thenable: PromiseLike<T>; reads: () => number } {
  let reads = 0;
  const thenable = Object.create(null, {
    then: {
      get() {
        reads++;
        return (onFulfilled: (value: T) => void) => onFulfilled(value);
      },
    },
  }) as PromiseLike<T>;
  return { thenable, reads: () => reads };
}

describe('resolve with a foreign thenable', () => {
  it('reads then exactly once', async () => {
    const { thenable, reads } = countingThenable(7);
    const { promise, resolve } = CancelablePromise.withResolvers<number>();

    resolve(thenable);

    await expect(promise).resolves.toBe(7);
    expect(reads()).toBe(1);
  });

  it('reads then exactly once with forceCancelable off', async () => {
    const { thenable, reads } = countingThenable(7);
    const promise = new CancelablePromise<number>((resolve) => resolve(thenable), { forceCancelable: false });

    await expect(promise).resolves.toBe(7);
    expect(reads()).toBe(1);
  });

  it('rejects when then throws, without throwing from resolve', async () => {
    const error = new Error('then threw');
    const { promise, resolve } = CancelablePromise.withResolvers<number>();
    handled(promise);
    const thenable = foreignThenable<number>(() => {
      throw error;
    });

    expect(() => resolve(thenable)).not.toThrow();
    await expect(promise).rejects.toBe(error);
    expect(promise.canceled).toBe(false);
  });

  it('rejects when reading then throws, without throwing from resolve', async () => {
    const error = new Error('getter threw');
    const { promise, resolve } = CancelablePromise.withResolvers<number>();
    handled(promise);
    const thenable = Object.create(null, {
      then: {
        get() {
          throw error;
        },
      },
    }) as PromiseLike<number>;

    expect(() => resolve(thenable)).not.toThrow();
    await expect(promise).rejects.toBe(error);
  });

  it('ignores a throw from then after it already resolved', async () => {
    const thenable = foreignThenable<number>((onFulfilled) => {
      onFulfilled(1);
      throw new Error('late throw');
    });

    await expect(new CancelablePromise<number>((resolve) => resolve(thenable))).resolves.toBe(1);
  });

  it('calls then in a later job, not synchronously', async () => {
    const then = jest.fn<void, Parameters<TForeignThen<number>>>((onFulfilled) => onFulfilled(1));
    const { promise, resolve } = CancelablePromise.withResolvers<number>();

    resolve(foreignThenable(then));

    expect(then).not.toHaveBeenCalled();
    await expect(promise).resolves.toBe(1);
    expect(then).toHaveBeenCalledTimes(1);
  });

  it('adopts a callable thenable', async () => {
    const callable = Object.assign(() => undefined, {
      then: (onFulfilled: (value: string) => void) => onFulfilled('from callable'),
    });

    expect(isThenable(callable)).toBe(true);
    const promise = new CancelablePromise<string>((resolve) => resolve(callable as unknown as PromiseLike<string>));
    await expect(promise).resolves.toBe('from callable');
  });

  it('adopts a thenable yielding a thenable that rejects with a CancelError, canceled without unhandled rejection', async () => {
    const inner = foreignThenable<number>((_onFulfilled, onRejected) => onRejected(new CancelError('inner')));
    const outer = foreignThenable<PromiseLike<number>>((onFulfilled) => onFulfilled(inner));
    const promise = new CancelablePromise<number>((resolve) => resolve(outer as unknown as PromiseLike<number>));

    await drainMicrotasks();
    await hostTurn();

    expect(promise.canceled).toBe(true);
  });

  it('adopts a thenable yielding a canceled cancelable, canceled without unhandled rejection', async () => {
    const inner = new CancelablePromise<number>(() => undefined);
    void inner.cancel('inner');
    const outer = foreignThenable<PromiseLike<number>>((onFulfilled) => onFulfilled(inner));
    const promise = new CancelablePromise<number>((resolve) => resolve(outer as unknown as PromiseLike<number>));

    await drainMicrotasks();
    await hostTurn();

    expect(promise.canceled).toBe(true);
  });

  it('settles in the same job order as a native promise', async () => {
    const trace = async (Ctor: PromiseConstructor): Promise<string[]> => {
      const log: string[] = [];
      let tick = 0;
      let ticking = true;
      const step = (): void => {
        tick++;
        if (ticking) {
          void NativePromise.resolve().then(step);
        }
      };
      void NativePromise.resolve().then(step);
      const thenable = foreignThenable<number>((onFulfilled) => {
        log.push(`then called @${tick}`);
        void NativePromise.resolve().then(() => onFulfilled(7));
      });
      void new Ctor<number>((resolve) => resolve(thenable)).then((value) => log.push(`adopted ${value} @${tick}`));
      await drainMicrotasks(20);
      ticking = false;
      return log;
    };

    const native = await trace(NativePromise);
    const canc = await trace(CancelablePromise as unknown as PromiseConstructor);

    expect(native).toHaveLength(2);
    expect(canc).toEqual(native);
  });
});
