import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';

import { toAbortSignal } from './abort';

/**
 * End-to-end smoke: a CancelablePromise drives a fetch-shaped consumer through toAbortSignal,
 * and canceling the promise aborts the consumer with a CancelError, not a raw DOMException.
 */
describe('abort signal interop smoke: promise cancels -> consumer aborts with CancelError', () => {
  /**
   * A mock fetch-like consumer: takes { signal } option, listens for abort, and rejects with
   * signal.reason when the signal fires. Simulates what real fetch and other signal-aware APIs do.
   */
  function fetchLike<T = void>(options?: { signal?: AbortSignal }): Promise<T> {
    return new Promise((resolve, reject) => {
      const signal = options?.signal;
      if (!signal) {
        // Resolves immediately when no signal passed rather than hang
        resolve(undefined as unknown as T);
        return;
      }

      if (signal.aborted) {
        // Signal already aborted: reject immediately with its reason.
        reject(signal.reason);
        return;
      }

      // Listen for abort and reject with the signal's reason.
      signal.addEventListener(
        'abort',
        () => {
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }

  it('canceling a promise aborts a signal-aware consumer with a CancelError', async () => {
    // Create a promise that will be canceled.
    const promise = new CancelablePromise<void>(() => {
      // Never settles on its own, canceled explicitly below
    });

    // Derive a signal from the promise.
    const signal = toAbortSignal(promise);

    // Pass the signal to a fetch-like consumer.
    const consumer = fetchLike({ signal });

    // Cancel the promise, which should abort the signal.
    promise.cancel('operation stopped');

    // The consumer should reject with the CancelError from the promise's cancel.
    let rejectionReason: unknown;
    try {
      await consumer;
    } catch (e) {
      rejectionReason = e;
    }

    // Verify the rejection is a CancelError, not a DOMException AbortError.
    expect(rejectionReason).toBeDefined();
    expect(isCancelError(rejectionReason)).toBe(true);
    expect((rejectionReason as CancelError).message).toBe('operation stopped');
  });

  it('canceling with no message produces a default CancelError', async () => {
    const promise = new CancelablePromise<void>(() => {
      /**/
    });

    const signal = toAbortSignal(promise);
    const consumer = fetchLike({ signal });

    promise.cancel();

    let rejectionReason: unknown;
    try {
      await consumer;
    } catch (e) {
      rejectionReason = e;
    }

    expect(isCancelError(rejectionReason)).toBe(true);
    expect((rejectionReason as CancelError).message).toBe('');
  });
});
