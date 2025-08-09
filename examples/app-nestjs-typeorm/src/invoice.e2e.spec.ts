import 'reflect-metadata';
import http from 'node:http';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule as CancModule } from './app.module-canc';
import { AppModule as VanillaModule } from './app.module-vanilla';
import { createDataSource, SEED_CUSTOMER_COUNT } from './mock/db';
import { countInvoices } from './invoice-repo';
import { BillingTierGuard } from './billing-metadata';
import type { DataSource } from 'typeorm';

function delay(ms: number): Promise<void> {
 return new Promise((resolve) => setTimeout(resolve, ms));
}

async function boot(module: any): Promise<{ app: INestApplication; dataSource: DataSource; port: number }> {
 const dataSource = await createDataSource();
 const app = await NestFactory.create(module.register(dataSource), { logger: false });
 await app.listen(0);
 const server = app.getHttpServer() as http.Server;
 const address = server.address();
 const port = typeof address === 'object' && address ? address.port : 0;
 return { app, dataSource, port };
}

/** Fires POST /invoices/bulk, lets a chunk or two run, destroys the socket, returns the count after. */
async function countAfterDisconnect(dataSource: DataSource, port: number): Promise<number> {
 const req = http.request({ host: '127.0.0.1', port, path: '/invoices/bulk', method: 'POST' }, (res) =>
 res.resume(),
 );
 req.on('error', () => {});
 req.end();
 await delay(60);
 req.destroy();
 await delay(600);
 return countInvoices(dataSource.manager);
}

describe('bulk invoice generation cancellation on client disconnect', () => {
 beforeEach(() => {
 BillingTierGuard.lastSeenTier = undefined;
 delete process.env.CANC_MANUAL;
 });

 it('canc decorated: disconnect mid-bulk rolls the transaction back, count unchanged', async () => {
 const { app, dataSource, port } = await boot(CancModule);

 const before = await countInvoices(dataSource.manager);
 const after = await countAfterDisconnect(dataSource, port);

 // Rollback proof: the partial transaction was undone, so the count is exactly what it was.
 expect(before).toBe(0);
 expect(after).toBe(0);

 await app.close();
 await dataSource.destroy();
 });

 it('canc manual (no decorator): same rollback, count unchanged', async () => {
 process.env.CANC_MANUAL = '1';
 const { app, dataSource, port } = await boot(CancModule);

 const after = await countAfterDisconnect(dataSource, port);

 expect(after).toBe(0);

 await app.close();
 await dataSource.destroy();
 });

 it('SetMetadata marker survives the @AsyncMethod wrapper (guard still reads the billing tier)', async () => {
 const { app, dataSource } = await boot(CancModule);

 await request(app.getHttpServer()).get('/invoices').expect(200);

 // The guard read the @BillingTier('standard') marker off the wrapped listInvoices method.
 expect(BillingTierGuard.lastSeenTier).toBe('standard');

 await app.close();
 await dataSource.destroy();
 });

 it('vanilla uncancelable: every chunk commits even after the client left (the bug we teach)', async () => {
 const { app, dataSource, port } = await boot(VanillaModule);

 const before = await countInvoices(dataSource.manager);
 const after = await countAfterDisconnect(dataSource, port);

 // No cancellation: the transaction committed the full run for a socket nobody is reading.
 expect(before).toBe(0);
 expect(after).toBe(SEED_CUSTOMER_COUNT);

 await app.close();
 await dataSource.destroy();
 });
});
