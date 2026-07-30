import { CancelablePromise } from '../cancelable-promise';

/**
 * A+ Compliance Adapter
 *
 * Runs promises-aplus-tests with CancelablePromise via a deferred pattern (withResolvers).
 * CancelablePromise.withResolvers() returns { promise, resolve, reject } matching the
 * A+ test suite's expectations.
 *
 * Attribution: https://github.com/promises-aplus/promises-tests
 * Adapter pattern: deferred = withResolvers() (ES2024 standard).
 *
 * Note: This spec is designed to be run with promises-aplus-tests npm package.
 * Jest integration: we run the adapter object as a test to verify the interface exists.
 */

/**
 * A+ Test Adapter.
 * Implements the "deferred" pattern expected by promises-aplus-tests.
 * Returns an object with { promise, resolve, reject }.
 */
export function promisesAPlusAdapter() {
  return CancelablePromise.withResolvers<any>();
}

describe('A+ Adapter (promises-aplus-tests compatible)', () => {
  it('adapter returns object with promise, resolve, reject properties', () => {
    const deferred = promisesAPlusAdapter();
    expect(deferred).toHaveProperty('promise');
    expect(deferred).toHaveProperty('resolve');
    expect(deferred).toHaveProperty('reject');
    expect(deferred.promise).toBeInstanceOf(CancelablePromise);
    expect(typeof deferred.resolve).toBe('function');
    expect(typeof deferred.reject).toBe('function');
  });

  it('resolve settles the promise with value', async () => {
    const deferred = promisesAPlusAdapter();
    deferred.resolve(42);
    await expect(deferred.promise).resolves.toBe(42);
  });

  it('reject settles the promise with reason', async () => {
    const deferred = promisesAPlusAdapter();
    const error = new Error('test rejection');
    deferred.reject(error);
    await expect(deferred.promise).rejects.toBe(error);
  });

  it('resolve with thenable adopts thenable state', async () => {
    const deferred = promisesAPlusAdapter();
    const thenable = { then: (res: any) => res('adopted') };
    deferred.resolve(thenable);
    await expect(deferred.promise).resolves.toBe('adopted');
  });

  it('multiple resolutions are idempotent (first wins)', async () => {
    const deferred = promisesAPlusAdapter();
    deferred.resolve('first');
    deferred.resolve('second');
    deferred.reject(new Error('third'));
    await expect(deferred.promise).resolves.toBe('first');
  });

  it('multiple rejections are idempotent (first wins)', async () => {
    const deferred = promisesAPlusAdapter();
    const err1 = new Error('first');
    const err2 = new Error('second');
    deferred.reject(err1);
    deferred.reject(err2);
    deferred.resolve('value');
    await expect(deferred.promise).rejects.toBe(err1);
  });
});
