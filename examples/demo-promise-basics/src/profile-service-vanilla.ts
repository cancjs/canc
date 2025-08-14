import { Profile } from './profile';
import type { MockApiBundle } from '@shared/mock-api';

type ProductsApi = MockApiBundle['products'];

/**
 * Plain promise: no cancellation support. The result is discarded when the caller loses
 * interest, but the mock API call completes anyway (wasted work).
 */
export function loadProfile(productsApi: ProductsApi, userId: string): Promise<Profile> {
 return productsApi.get(userId);
}

/**
 * Attempted cancellation with AbortController: threads the signal down, listens for the abort
 * event, and checks error.name === 'AbortError' at the call site. The boilerplate teaches
 * why canc matters: every cleanup point needs manual wiring.
 * cancellation requires threading and name-checking; regular catch alone is not enough.
 */
export function loadProfileAbortable(
 productsApi: ProductsApi,
 userId: string,
 signal: AbortSignal
): Promise<Profile> {
 return productsApi.get(userId, signal);
}
