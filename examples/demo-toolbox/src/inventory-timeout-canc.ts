import CancelablePromise from '@cancjs/promise';
import { timeout } from '@cancjs/toolbox';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * Checks inventory quantity with a 500ms timeout using the toolbox timeout utility bound
 * to CancelablePromise. When the timeout fires, it cancels the underlying inventory call
 * immediately. The mock API logs aborted (see spec) compared to vanilla completed.
 */
export function fetchInventoryWithTimeout(
 mockApi: MockApiBundle,
 productId: string
): Promise<number> {
 return timeout(
 mockApi.inventory.check(productId),
 500,
 { impl: CancelablePromise as any }
 );
}
