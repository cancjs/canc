import { getEventListeners } from 'node:events';

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
