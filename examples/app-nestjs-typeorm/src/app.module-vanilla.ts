import { DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { BillingTierGuard } from './billing-metadata';
import { CancelInterceptor } from './cancel.interceptor-vanilla';
import { InvoiceController } from './invoice.controller-vanilla';
import { InvoiceService } from './invoice.service-vanilla';
import { INVOICE_SERVICE } from './invoice.tokens';

/**
 * The vanilla module. It installs the passthrough interceptor app-wide and registers the plain
 * invoice service. There is no manual-wiring twin here: without cancellation the two flavors would
 * be identical, so only the decorated -canc side carries the flavor switch.
 */
@Module({})
export class AppModule {
  static register(dataSource: DataSource): DynamicModule {
    return {
      module: AppModule,
      controllers: [InvoiceController],
      providers: [
        { provide: DataSource, useValue: dataSource },
        { provide: APP_INTERCEPTOR, useClass: CancelInterceptor },
        BillingTierGuard,
        { provide: INVOICE_SERVICE, useClass: InvoiceService },
      ],
    };
  }
}
