import type { CancelablePromise } from '@cancjs/promise';
import type { BulkResult } from './invoice-repo';

/** DI token both flavors register the invoice service under, so the controller stays flavor-blind. */
export const INVOICE_SERVICE = 'INVOICE_SERVICE';

/**
 * The shape the vanilla controller depends on. The plain service returns ordinary promises and has
 * nothing to cancel.
 */
export interface InvoiceServiceLike {
 listInvoices(): Promise<number>;
 generateAll(): Promise<BulkResult>;
}

/**
 * The shape the canc controller depends on. Both the decorated and the manual service return
 * cancelable promises, so the controller can hand them to the interceptor's `run` hook.
 */
export interface CancInvoiceServiceLike {
 listInvoices(): CancelablePromise<number>;
 generateAll(): CancelablePromise<BulkResult>;
}
