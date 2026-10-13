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
