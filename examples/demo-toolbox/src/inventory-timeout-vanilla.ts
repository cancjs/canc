import type { MockApiBundle } from '@shared/mock-api';

/**
 * Checks inventory quantity with a 500ms timeout using Promise.race(). Race returns
 * immediately on timeout, but the underlying inventory call keeps running (wasted work,
 * eventual state update).
 */
export function fetchInventoryWithTimeout(
 mockApi: MockApiBundle,
 productId: string
): Promise<number> {
 const timeoutPromise = new Promise<number>((_, reject) => {
 setTimeout(() => reject(new Error('timeout')), 500);
 });

 return Promise.race([mockApi.inventory.check(productId), timeoutPromise]);
}
