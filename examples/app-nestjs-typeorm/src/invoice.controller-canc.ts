import { Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { CancelablePromise } from '@cancjs/promise';
import { BillingTierGuard } from './billing-metadata';
import { CancInvoiceServiceLike, INVOICE_SERVICE } from './invoice.tokens';
import type { CancelableRequest } from './cancelable-request';
import type { BulkResult } from './invoice-repo';

/**
 * The invoicing controller. Each handler returns its cancelable service call and leaves the same
 * promise on the request, which is all the interceptor needs to cancel the in-flight coroutine when
 * a client disconnects. Nest awaits the returned cancelable promise like any promise
 * (CancelablePromise is a native Promise subclass). The guard runs before each handler and reads the
 * @BillingTier marker, which proves the marker survived the service's @AsyncMethod wrapper.
 */
@Controller('invoices')
@UseGuards(BillingTierGuard)
export class InvoiceController {
 constructor(@Inject(INVOICE_SERVICE) private readonly invoices: CancInvoiceServiceLike) {}

 @Get()
 list(@Req() request: CancelableRequest): CancelablePromise<number> {
 return (request.cancelable = this.invoices.listInvoices());
 }

 @Post('bulk')
 bulk(@Req() request: CancelableRequest): CancelablePromise<BulkResult> {
 return (request.cancelable = this.invoices.generateAll());
 }
}
