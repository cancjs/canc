import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { defer, delay, minDelay, retry, timeout, waitFor } from './index';

// The prebound canc exports default to CancelablePromise, so their declared return type must be
// CancelablePromise<T>. Each `.cancel()` below is called with no cast: if a return type ever
// regressed to a plain Promise<T>, `.cancel` would not exist and this file would fail to compile.
describe('prebound exports return CancelablePromise', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('delay result exposes cancel without a cast', () => {
    const promise = delay('x', 1000);
    expect(promise).toBeInstanceOf(CancelablePromise);
    promise.cancel();
  });

  it('waitFor result exposes cancel without a cast', () => {
    const promise = waitFor(() => false);
    expect(promise).toBeInstanceOf(CancelablePromise);
    promise.cancel();
  });

  it('timeout result exposes cancel without a cast', () => {
    const promise = timeout(delay(1000), 5000);
    expect(promise).toBeInstanceOf(CancelablePromise);
    promise.cancel();
  });

  it('minDelay result exposes cancel without a cast', () => {
    const promise = minDelay(delay('v', 10), 1000);
    expect(promise).toBeInstanceOf(CancelablePromise);
    promise.cancel();
  });

  it('retry result exposes cancel without a cast', () => {
    const promise = retry(() => Promise.reject(new Error('nope')), { retries: 5, minTimeout: 1000 });
    expect(promise).toBeInstanceOf(CancelablePromise);
    promise.cancel();
  });

  it('defer promise exposes cancel without a cast', () => {
    const deferred = defer<number>();
    expect(deferred.promise).toBeInstanceOf(CancelablePromise);
    deferred.promise.cancel();
  });

  it('canceling waitFor rejects with a CancelError', async () => {
    const promise = waitFor(() => false);
    promise.cancel();
    const reason = await promise.catch((error) => error);
    expect(isCancelError(reason)).toBe(true);
  });
});
