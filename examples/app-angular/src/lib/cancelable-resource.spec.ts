import type { DestroyRef, ErrorHandler } from '@angular/core';
import { CancelablePromise } from '@cancjs/promise';

import { CancelableResource } from './cancelable-resource';

function createDeferred<T = string>(): {
  promise: CancelablePromise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new CancelablePromise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeDestroyRef(): { onDestroy: (cb: () => void) => void; destroy: () => void } {
  let cb: (() => void) | undefined;
  return {
    onDestroy: (callback) => {
      cb = callback;
    },
    destroy: () => cb?.(),
  };
}

describe('CancelableResource error routing', () => {
  it("reports a non-cancel rejection to Angular's ErrorHandler and to the local error field", async () => {
    const handleError = jest.fn();
    const errorHandler = { handleError } as unknown as ErrorHandler;
    const resource = new CancelableResource<string>(fakeDestroyRef() as unknown as DestroyRef, errorHandler);
    const deferred = createDeferred<string>();

    resource.run(deferred.promise);
    const failure = new Error('order backend is down');
    deferred.reject(failure);
    await Promise.resolve();

    expect(handleError).toHaveBeenCalledWith(failure);
    expect(resource.status).toBe('rejected');
    expect(resource.error).toBe(failure);
  });

  it('resets status to idle via the isCancelError branch when caller cancels directly', async () => {
    const handleError = jest.fn();
    const errorHandler = { handleError } as unknown as ErrorHandler;
    const resource = new CancelableResource<string>(fakeDestroyRef() as unknown as DestroyRef, errorHandler);
    const deferred = createDeferred<string>();

    resource.run(deferred.promise);
    expect(resource.status).toBe('pending');

    deferred.promise.cancel();
    await Promise.resolve();

    expect(handleError).not.toHaveBeenCalled();
    expect(resource.status).toBe('idle');
    expect(resource.error).toBeUndefined();
    expect(resource.value).toBeUndefined();
  });

  it('does not report a CancelError from a superseded load', async () => {
    const handleError = jest.fn();
    const errorHandler = { handleError } as unknown as ErrorHandler;
    const resource = new CancelableResource<string>(fakeDestroyRef() as unknown as DestroyRef, errorHandler);
    const first = createDeferred<string>();
    const second = createDeferred<string>();

    resource.run(first.promise);
    resource.run(second.promise);
    await Promise.resolve();

    expect(handleError).not.toHaveBeenCalled();
    expect(resource.status).toBe('pending');
  });

  it('does not report a CancelError from destroy', async () => {
    const handleError = jest.fn();
    const errorHandler = { handleError } as unknown as ErrorHandler;
    const destroyRef = fakeDestroyRef();
    const resource = new CancelableResource<string>(destroyRef as unknown as DestroyRef, errorHandler);
    const deferred = createDeferred<string>();

    resource.run(deferred.promise);
    destroyRef.destroy();
    await Promise.resolve();

    expect(handleError).not.toHaveBeenCalled();
    expect(resource.status).toBe('idle');
  });
});
