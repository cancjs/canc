import http from 'node:http';
import Fastify, { FastifyInstance } from 'fastify';
import { sleep } from '@shared/util';
import { cancAwait } from '@cancjs/coroutine';
import { cancAsyncRoute } from './lib/cancelable-route';
import { searchAvailability as searchCanc } from './availability-service-canc';
import { searchAvailability as searchVanilla } from './availability-service-vanilla';
import { installMocks, queryLog, resetQueryLog } from './mock/db';

const QUERY_LATENCY_MS = 50;

async function buildServer(flavor: 'canc' | 'vanilla'): Promise<FastifyInstance> {
 const app = Fastify();
 if (flavor === 'canc') {
 app.get(
 '/availability',
 cancAsyncRoute(function* (_request, reply) {
 const result = yield* cancAwait(searchCanc('grand-plaza', '2026-08-01'));
 reply.send(result);
 })
 );
 } else {
 app.get('/availability', async (_request, reply) => {
 const result = await searchVanilla('grand-plaza', '2026-08-01');
 return reply.send(result);
 });
 }
 return app;
}

function requestThenDisconnect(port: number): Promise<void> {
 return new Promise((resolve) => {
 const req = http.get({ port, path: '/availability' }, () => {});
 req.on('error', () => {});
 // Disconnect while the first query is still in flight (before its latency elapses),
 // so a chain-cancel has both later queries left to skip.
 setTimeout(() => {
 req.destroy();
 resolve();
 }, QUERY_LATENCY_MS / 2);
 });
}

async function portOf(app: FastifyInstance): Promise<number> {
 await app.listen({ port: 0 });
 const address = app.server.address();
 return typeof address === 'object' && address ? address.port : 0;
}

describe('app-fastify-mongoose availability search', () => {
 let app: FastifyInstance;

 afterEach(async () => {
 if (app) await app.close();
 });

 it('cancels the query chain on disconnect, skipping the later queries', async () => {
 installMocks(QUERY_LATENCY_MS);
 resetQueryLog();
 app = await buildServer('canc');
 const port = await portOf(app);

 await requestThenDisconnect(port);
 await sleep(QUERY_LATENCY_MS * 4);

 const issued = queryLog.map((q) => q.op);
 // First query started before the disconnect landed.
 expect(issued).toContain('findRooms');
 // Chain-cancel froze the log here: the later queries were never issued.
 expect(issued).not.toContain('loadRates');
 expect(issued).not.toContain('aggregateOccupancy');
 });

 it('vanilla keeps querying after disconnect (the bug this example teaches)', async () => {
 installMocks(QUERY_LATENCY_MS);
 resetQueryLog();
 app = await buildServer('vanilla');
 const port = await portOf(app);

 await requestThenDisconnect(port);
 await sleep(QUERY_LATENCY_MS * 4);

 const issued = queryLog.map((q) => q.op);
 // Uncancelable: every query runs for the dead socket.
 expect(issued).toContain('findRooms');
 expect(issued).toContain('loadRates');
 expect(issued).toContain('aggregateOccupancy');
 });
});
