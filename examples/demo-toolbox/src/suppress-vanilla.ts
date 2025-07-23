import type { MockApiBundle } from '@shared/mock-api';

/**
 * Cleanup that should never fail (shield). Vanilla: manual try/catch + error.name laddering
 * to swallow abort-type errors while preserving real errors. Tedious + error-prone.
 */
export function cleanupPaymentRecord(
 mockApi: MockApiBundle,
 recordId: string
): Promise<void> {
 return new Promise((resolve) => {
 mockApi.payments.cleanup(recordId).then(
 () => resolve(),
 (err) => {
 if (err.name === 'AbortError' || err.name === 'CanceledError') {
 resolve(); // swallow abort-like errors
 } else {
 throw err; // re-throw real errors
 }
 }
 );
 });
}
