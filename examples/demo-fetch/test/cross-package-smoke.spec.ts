import * as canc from '@cancjs/coroutine';
import { cancelableFetchFactory } from '@cancjs/fetch';
import { CancelablePromise, catchTimeout, TimeoutError } from '@cancjs/promise';
import { retry, timeout } from '@cancjs/toolbox';

// Minimal, dependency-free type identity check (same trick the shared type-level suites use):
// distinguishes `any` and `unknown` from a real type, unlike an annotated assignment, which the
// covariant failure channel would let pass silently.
type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

describe('Cross-package declared failure flow', () => {
  it('narrows failures correctly at each hop', async () => {
    // 1. Mock fetch that always hangs, forcing a timeout
    const hangingFetch = () => new Promise<Response>(() => {});
    const cancelableFetch = cancelableFetchFactory({ fetch: hangingFetch });

    // 2. Fetch call with a 10ms timeout
    const fetchWithTimeout = (): CancelablePromise<Response, TimeoutError> =>
      timeout(cancelableFetch('https://api.example.com/data'), 10);

    // 3. Wrapped by a toolbox retry (3 attempts)
    const retryFetch = (): CancelablePromise<Response, TimeoutError> =>
      retry(fetchWithTimeout, { retries: 2, initialDelay: 1 });

    // 4. Consumed by a coroutine
    const fetchCoroutine = canc.async(function* () {
      try {
        // Assert inferred failure set at hop 3:
        const response = yield* canc.await(retryFetch());
        return yield* canc.await(response.json());
      } catch (error) {
        try {
          // Narrow with the core inline helper. A real timeout resolves to its own declared
          // type; anything else rethrows here instead of returning something falsy to test.
          catchTimeout(error);
          return 'timed-out-gracefully';
        } catch {
          throw error;
        }
      }
    });

    const result = await fetchCoroutine();
    expect(result).toBe('timed-out-gracefully');

    // Type-level assertions: identity, not an annotated assignment. The failure channel is
    // covariant, so an annotated assignment accepts a narrower real type without noticing a
    // regression; only identity can catch that.
    const hop2 = fetchWithTimeout();
    const _typeCheckHop2: Eq<typeof hop2, CancelablePromise<Response, TimeoutError>> = true;
    hop2.cancel();

    const hop3 = retryFetch();
    const _typeCheckHop3: Eq<typeof hop3, CancelablePromise<Response, TimeoutError>> = true;
    hop3.cancel();

    expect(_typeCheckHop2).toBe(true);
    expect(_typeCheckHop3).toBe(true);
  });
});
