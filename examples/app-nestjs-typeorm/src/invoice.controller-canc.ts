import type { IncomingMessage, ServerResponse } from 'node:http';

import { type CancelablePromise, makeCancelable } from '@cancjs/promise';
import { getRequestSignal } from '@cancjs/server-express';
import { Controller, Get, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';

import { BillingTierGuard } from './billing-metadata';
import { CancInvoiceServiceLike, INVOICE_SERVICE } from './invoice.tokens';
import type { BulkResult } from './invoice-repo';

/**
 * The invoicing controller. Each handler binds its cancelable service call to the request's cancel
 * signal, which is all it takes for a disconnect to stop the in-flight coroutine: makeCancelable
 * cancels the call it wraps when the signal fires. Nest awaits the returned cancelable promise like
 * any promise, because a CancelablePromise is a native Promise subclass. The guard runs before each
 * handler and reads the @BillingTier marker, which proves the marker survived the service's
 * @AsyncMethod wrapper.
 */
@Controller('invoices')
@UseGuards(BillingTierGuard)
export class InvoiceController {
  constructor(@Inject(INVOICE_SERVICE) private readonly invoices: CancInvoiceServiceLike) {}

  @Get()
  list(
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ): CancelablePromise<number> {
    const signal = getRequestSignal(request, response);

    return makeCancelable(this.invoices.listInvoices(), { signal });
  }

  @Post('bulk')
  bulk(
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ): CancelablePromise<BulkResult> {
    const signal = getRequestSignal(request, response);

    return makeCancelable(this.invoices.generateAll(), { signal });
  }
}
