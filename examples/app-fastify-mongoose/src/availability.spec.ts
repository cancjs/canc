import http from 'node:http';
import Fastify, { FastifyInstance } from 'fastify';
import { cancellationPlugin as cancPlugin } from './hooks-canc';
import { cancellationPlugin as vanillaPlugin } from './hooks-vanilla';
import { searchAvailability as searchCanc } from './availability-service-canc';
import { searchAvailability as searchVanilla } from './availability-service-vanilla';
import { installMocks, queryLog, resetQueryLog } from './mock/db';

const QUERY_LATENCY_MS = 50;

async function buildServer(flavor: 'canc' | 'vanilla'): Promise<FastifyInstance> {
 const app = Fastify();
 if (flavor === 'canc') {
 await app.register(cancPlugin);
 app.get('/availability', async (request, reply) => {
 const work = searchCanc('grand-plaza', '2026-08-01');
 return reply.send(await request.cancelOnClose(work));
 });
 } else {
 await app.register(vanillaPlugin);
 app.get('/availability', async (request, reply) => {
 const work = searchVanilla('grand-plaza', '2026-08-01');
 return reply.send(await request.cancelOnClose(work));
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
 await new Promise((r) => setTimeout(r, QUERY_LATENCY_MS * 4));

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
 await new Promise((r) => setTimeout(r, QUERY_LATENCY_MS * 4));

 const issued = queryLog.map((q) => q.op);
 // Uncancelable: every query runs for the dead socket.
 expect(issued).toContain('findRooms');
 expect(issued).toContain('loadRates');
 expect(issued).toContain('aggregateOccupancy');
 });
});
