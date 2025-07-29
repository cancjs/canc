import http from 'node:http';
import request from 'supertest';
import type { Express } from 'express';
import { createApp as createCancApp } from './main-canc';
import { createApp as createVanillaApp } from './main-vanilla';
import { aggregateChunkCount } from './report-queries';
import type { ReportDb } from './mock/db';

function countAggregateQueries(rdb: ReportDb): number {
 return rdb.queryLog.filter((sql) => sql.includes('"id" >') && sql.includes('"id" <=')).length;
}

function delay(ms: number): Promise<void> {
 return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withServer<T>(app: Express, fn: (port: number) => Promise<T>): Promise<T> {
 const server = http.createServer(app);
 await new Promise<void>((resolve) => server.listen(0, resolve));
 const address = server.address();
 const port = typeof address === 'object' && address ? address.port : 0;
 try {
 return await fn(port);
 } finally {
 await new Promise<void>((resolve) => server.close(() => resolve()));
 }
}

/**
 * Fires the report request, lets a slice or two run, then destroys the client socket. Returns the
 * aggregate-slice count captured right after the disconnect settles.
 */
async function slicesAfterDisconnect(app: Express, rdb: ReportDb, path: string): Promise<number> {
 return withServer(app, async (port) => {
 const req = http.get(`http://127.0.0.1:${port}${path}`);
 req.on('error', () => {});
 await delay(40);
 req.destroy();
 await delay(400);
 return countAggregateQueries(rdb);
 });
}

describe('orders report cancellation on client disconnect', () => {
 it('canc: disconnect freezes the query log before the aggregate finishes', async () => {
 const { app, rdb } = createCancApp();
 const total = aggregateChunkCount();

 const ran = await slicesAfterDisconnect(app, rdb, '/orders/report');

 // The chain stopped between slices: fewer than all of them ran.
 expect(ran).toBeGreaterThan(0);
 expect(ran).toBeLessThan(total);

 rdb.close();
 });

 it('vanilla uncancelable: every slice runs even after the client left (the bug we teach)', async () => {
 const { app, rdb } = createVanillaApp();
 const total = aggregateChunkCount();

 const ran = await slicesAfterDisconnect(app, rdb, '/orders/report');

 // No cancellation: the aggregate completes for a socket nobody is reading.
 expect(ran).toBe(total);

 rdb.close();
 });

 it('vanilla abortable: the AbortController workaround also stops early', async () => {
 const { app, rdb } = createVanillaApp();
 const total = aggregateChunkCount();

 const ran = await slicesAfterDisconnect(app, rdb, '/orders/report-abortable');

 expect(ran).toBeGreaterThan(0);
 expect(ran).toBeLessThan(total);

 rdb.close();
 });

 it('serves the product list to a client that stays connected', async () => {
 const { app, rdb } = createCancApp();

 const response = await request(app).get('/products');

 expect(response.status).toBe(200);
 expect(response.body.length).toBeGreaterThan(0);

 rdb.close();
 });
});
