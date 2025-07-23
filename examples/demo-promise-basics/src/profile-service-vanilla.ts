import { Profile } from './profile';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * Plain promise: no cancellation support. The result is discarded when the caller loses
 * interest, but the mock API call completes anyway (wasted work).
 */
export function loadProfile(mockApi: MockApiBundle, userId: string): Promise<Profile> {
 return mockApi.products.get(userId);
}

/**
 * Attempted cancellation with AbortController: threads the signal down, listens for the abort
 * event, and checks error.name === 'AbortError' at the call site. The boilerplate teaches
 * why canc matters—every cleanup point needs manual wiring.
 * cancellation requires threading and name-checking; regular catch alone is not enough.
 */
export function loadProfileAbortable(
 mockApi: MockApiBundle,
 userId: string,
 signal: AbortSignal
): Promise<Profile> {
 return mockApi.products.get(userId, signal);
}
