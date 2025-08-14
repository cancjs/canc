import type { MockApiBundle } from '@shared/mock-api';

type InvoicesApi = MockApiBundle['invoices'];

/**
 * Cleanup that should never fail (shield). Vanilla: manual try/catch plus error.name
 * laddering to swallow abort-type errors while preserving real errors. Tedious plus
 * error-prone.
 */
export function cleanupPaymentRecord(
 invoicesApi: InvoicesApi,
 recordId: string
): Promise<void> {
 return new Promise((resolve) => {
 invoicesApi.list().then(
 () => resolve(),
 (err: any) => {
 if (err.name === 'AbortError' || err.name === 'CanceledError') {
 resolve(); // swallow abort-like errors
 } else {
 throw err; // re-throw real errors
 }
 }
 );
 });
}
