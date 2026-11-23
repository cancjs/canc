import type CancelablePromise from '@cancjs/promise';
import { cancelify, timeout } from '@cancjs/toolbox';
import type { MockApiBundle } from '@shared/mock-api';

type InventoryApi = MockApiBundle['inventory'];

/**
 * Checks inventory quantity with a 500ms timeout using the toolbox timeout utility,
 * which is bound to CancelablePromise. The signal-aware API boundary receives a
 * cancellation signal, so the pending inventory request aborts on timeout.
 */
export function fetchInventoryWithTimeout(
  inventoryApi: InventoryApi,
  productId: string,
): CancelablePromise<number, unknown> {
  const check = cancelify(({ getSignal }, id: string) => inventoryApi.check(id, getSignal()));

  return timeout(check(productId), 500);
}
