import { CancelablePromise } from '@cancjs/promise';
import { effectScope } from 'vue';

import { useCancelablePromise } from './use-cancelable-promise';

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

describe('useCancelablePromise', () => {
  it('transitions status from pending to idle and clears data on cancel', async () => {
    const deferred = createDeferred<string>();
    let state!: ReturnType<typeof useCancelablePromise<string>>;

    const scope = effectScope();
    scope.run(() => {
      state = useCancelablePromise(() => deferred.promise);
    });

    expect(state.status.value).toBe('pending');
    expect(state.pending.value).toBe(true);

    scope.stop();
    await Promise.resolve();
    await Promise.resolve();

    expect(state.status.value).toBe('idle');
    expect(state.pending.value).toBe(false);
    expect(state.data.value).toBeUndefined();
    expect(state.error.value).toBeUndefined();
  });

  it('sets status to rejected on non-cancel error', async () => {
    const deferred = createDeferred<string>();
    let state!: ReturnType<typeof useCancelablePromise<string>>;

    const scope = effectScope();
    scope.run(() => {
      state = useCancelablePromise(() => deferred.promise);
    });

    const failure = new Error('network down');
    deferred.reject(failure);
    await Promise.resolve();
    await Promise.resolve();

    expect(state.status.value).toBe('rejected');
    expect(state.pending.value).toBe(false);
    expect(state.error.value).toBe(failure);
    expect(state.data.value).toBeUndefined();
  });

  it('sets status to fulfilled and populates data on success', async () => {
    const deferred = createDeferred<string>();
    let state!: ReturnType<typeof useCancelablePromise<string>>;

    const scope = effectScope();
    scope.run(() => {
      state = useCancelablePromise(() => deferred.promise);
    });

    deferred.resolve('ok');
    await Promise.resolve();
    await Promise.resolve();

    expect(state.status.value).toBe('fulfilled');
    expect(state.pending.value).toBe(false);
    expect(state.data.value).toBe('ok');
    expect(state.error.value).toBeUndefined();
  });
});
