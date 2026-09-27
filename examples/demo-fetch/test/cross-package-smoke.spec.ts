import * as canc from '@cancjs/coroutine';
import { cancelableFetchFactory } from '@cancjs/fetch';
import { catchTimeout, TimeoutError } from '@cancjs/promise';
import { retry, timeout } from '@cancjs/toolbox';

describe('Cross-package declared failure flow', () => {
  it('narrows failures correctly at each hop', async () => {
    // 1. Mock fetch that always hangs, forcing a timeout
    const hangingFetch = () => new Promise<Response>(() => {});
    const cancelableFetch = cancelableFetchFactory({ fetch: hangingFetch });

    // 2. Fetch call with a 10ms timeout
    const fetchWithTimeout = () => timeout(cancelableFetch('https://api.example.com/data'), 10);

    // 3. Wrapped by a toolbox retry (3 attempts)
    const retryFetch = () => retry(fetchWithTimeout, { retries: 2, minTimeout: 1 });

    // 4. Consumed by a coroutine
    const fetchCoroutine = canc.async(function* () {
      try {
        // Assert inferred failure set at hop 3:
        const response = yield* canc.await(retryFetch());
        return yield* canc.await(response.json());
      } catch (error) {
        // Narrow with the core inline helper
        const timeoutErr = catchTimeout(error);
        if (timeoutErr) {
          return 'timed-out-gracefully';
        }
        throw error;
      }
    });

    const result = await fetchCoroutine();
    expect(result).toBe('timed-out-gracefully');

    // Type-level assertions
    // retryFetch should return CancelablePromise<Response, TimeoutError | AbortError>
    // but the types are properly propagated
    const _typeCheckHop2: import('@cancjs/promise').CancelablePromise<
      Response,
      import('@cancjs/promise').AbortError | TimeoutError
    > = fetchWithTimeout();
    const _typeCheckHop3: import('@cancjs/promise').CancelablePromise<
      Response,
      import('@cancjs/promise').AbortError | TimeoutError
    > = retryFetch();

    // No actual code to run for the typechecks, just their presence is the assertion
    _typeCheckHop2.cancel();
    _typeCheckHop3.cancel();
  });
});
