import { suppressCancel } from '@cancjs/promise';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * Cleanup with suppressCancel. One-liner to suppress cancel-family errors while preserving
 * real errors. Declarative, easier to reason about, and hard to get wrong. The suppress
 * call swallows both CancelError and AbortError.
 */
export function cleanupPaymentRecord(
 mockApi: MockApiBundle,
 recordId: string
): Promise<void> {
 return suppressCancel(mockApi.invoices.list().then(() => undefined));
}
