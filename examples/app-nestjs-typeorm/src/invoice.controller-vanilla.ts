import type { IncomingMessage, ServerResponse } from 'node:http';

import { Controller, Get, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';

import { BillingTierGuard } from './billing-metadata';
import { INVOICE_SERVICE, InvoiceServiceLike } from './invoice.tokens';
import type { BulkResult } from './invoice-repo';

/**
 * The invoicing controller. Each handler just returns its service call; the promise is not
 * cancelable and nothing binds it to the disconnect, so a client leaving cannot stop the in-flight
 * work and the handler runs to the end. The guard still runs before each handler and reads the
 * @BillingTier marker (the marker sits on the plain method just the same).
 */
@Controller('invoices')
@UseGuards(BillingTierGuard)
export class InvoiceController {
  constructor(@Inject(INVOICE_SERVICE) private readonly invoices: InvoiceServiceLike) {}

  @Get()
  list(@Req() _request: IncomingMessage, @Res({ passthrough: true }) _response: ServerResponse): Promise<number> {
    // (no cancel signal to bind, see -canc; nothing can stop this)
    return this.invoices.listInvoices();
  }

  @Post('bulk')
  bulk(@Req() _request: IncomingMessage, @Res({ passthrough: true }) _response: ServerResponse): Promise<BulkResult> {
    // (no cancel signal to bind, see -canc; the bulk run cannot be stopped)
    return this.invoices.generateAll();
  }
}
