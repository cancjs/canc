import { Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { BillingTierGuard } from './billing-metadata';
import { INVOICE_SERVICE, InvoiceServiceLike } from './invoice.tokens';
import type { CancelableRequest } from './request-run';
import type { BulkResult } from './invoice-repo';

/**
 * The invoicing controller. Each handler just returns its service call; there is no `run` hook to
 * wrap it in, so a disconnect cannot cancel the in-flight work and the handler runs to the end. The
 * guard still runs before each handler and reads the @BillingTier marker (the marker sits on the
 * plain method just the same).
 */
@Controller('invoices')
@UseGuards(BillingTierGuard)
export class InvoiceController {
 constructor(@Inject(INVOICE_SERVICE) private readonly invoices: InvoiceServiceLike) {}

 @Get()
 list(@Req() _request: CancelableRequest): Promise<number> {
 return this.invoices.listInvoices(); // (no run hook — see -canc; nothing can cancel this)
 }

 @Post('bulk')
 bulk(@Req() _request: CancelableRequest): Promise<BulkResult> {
 return this.invoices.generateAll(); // (no run hook — see -canc; the bulk run cannot be stopped)
 }
}
