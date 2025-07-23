import type { MockApiBundle } from '@shared/mock-api';

/**
 * Fetches inventory with a 500ms timeout using Promise.race(). Race returns immediately on
 * timeout, but the underlying inventory call keeps running (wasted work, eventual state update).
 */
export function fetchInventoryWithTimeout(
 mockApi: MockApiBundle,
 productId: string
): Promise<Record<string, number>> {
 const timeoutPromise = new Promise<Record<string, number>>((_, reject) => {
 setTimeout(() => reject(new Error('timeout')), 500);
 });

 return Promise.race([mockApi.inventory.get(productId), timeoutPromise]);
}
