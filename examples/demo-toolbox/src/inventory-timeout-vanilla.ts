import type { MockApiBundle } from '@shared/mock-api';

type InventoryApi = MockApiBundle['inventory'];

/**
 * Checks inventory quantity with a 500ms timeout using Promise.race(). Race returns
 * immediately on timeout, but the underlying inventory call keeps running (wasted work,
 * eventual state update).
 */
export function fetchInventoryWithTimeout(inventoryApi: InventoryApi, productId: string): Promise<number> {
  const timeoutPromise = new Promise<number>((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), 500);
  });

  return Promise.race([inventoryApi.check(productId), timeoutPromise]);
}
