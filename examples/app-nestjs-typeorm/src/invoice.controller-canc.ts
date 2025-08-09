import { Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { BillingTierGuard } from './billing-metadata';
import { CancInvoiceServiceLike, INVOICE_SERVICE } from './invoice.tokens';
import type { CancelableRequest } from './request-run';
import type { BulkResult } from './invoice-repo';

/**
 * The invoicing controller. Each handler wraps its cancelable service call in `request.run`, the
 * hook the interceptor installed; that lets a client disconnect cancel the in-flight coroutine.
 * Nest awaits the returned cancelable promise like any promise (CancelablePromise is a native
 * Promise subclass). The guard runs before each handler and reads the @BillingTier marker, which
 * proves the marker survived the service's @AsyncMethod wrapper.
 */
@Controller('invoices')
@UseGuards(BillingTierGuard)
export class InvoiceController {
 constructor(@Inject(INVOICE_SERVICE) private readonly invoices: CancInvoiceServiceLike) {}

 @Get()
 list(@Req() request: CancelableRequest): Promise<number> {
 return request.run!(() => this.invoices.listInvoices());
 }

 @Post('bulk')
 bulk(@Req() request: CancelableRequest): Promise<BulkResult> {
 return request.run!(() => this.invoices.generateAll());
 }
}
