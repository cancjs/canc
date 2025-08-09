import { DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { CancelInterceptor } from './cancel.interceptor-canc';
import { InvoiceController } from './invoice.controller-canc';
import { InvoiceService } from './invoice.service-canc';
import { InvoiceServiceManual } from './invoice.service-manual-canc';
import { BillingTierGuard } from './billing-metadata';
import { INVOICE_SERVICE } from './invoice.tokens';

/**
 * The canc module. It installs the request-scoped cancel interceptor app-wide and picks the invoice
 * service flavor from an env flag: CANC_MANUAL=1 uses the explicit cancAsync wiring
 * (InvoiceServiceManual), otherwise the decorated InvoiceService. Both flavors register under the
 * same token, so the controller never changes.
 */
@Module({})
export class AppModule {
 static register(dataSource: DataSource): DynamicModule {
 const manual = process.env.CANC_MANUAL === '1';
 return {
 module: AppModule,
 controllers: [InvoiceController],
 providers: [
 { provide: DataSource, useValue: dataSource },
 { provide: APP_INTERCEPTOR, useClass: CancelInterceptor },
 BillingTierGuard,
 { provide: INVOICE_SERVICE, useClass: manual ? InvoiceServiceManual : InvoiceService },
 ],
 };
 }
}
