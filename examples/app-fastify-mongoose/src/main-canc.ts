import http from 'node:http';
import Fastify from 'fastify';
import { sleep } from '@shared/util';
import { cancellationPlugin } from './hooks-canc';
import { searchAvailability } from './availability-service-canc';
import { installMocks, queryLog, resetQueryLog } from './mock/db';

// Each query is held open for this long so a disconnect lands mid-chain, deterministically.
const QUERY_LATENCY_MS = 50;

async function buildServer() {
 const app = Fastify();
 await app.register(cancellationPlugin);

 app.get<{ Querystring: { hotelId?: string; date?: string } }>(
 '/availability',
 async (request, reply) => {
 const hotelId = request.query.hotelId ?? 'grand-plaza';
 const date = request.query.date ?? '2026-08-01';

 const work = searchAvailability(hotelId, date);
 const result = await request.cancelOnClose(work);
 return reply.send(result);
 }
 );

 return app;
}

// Fire a request, then destroy the socket while the first query is still running.
function requestThenDisconnect(port: number): Promise<void> {
 return new Promise((resolve) => {
 const req = http.get(
 { port, path: '/availability?hotelId=grand-plaza&date=2026-08-01' },
 () => {}
 );
 req.on('error', () => {});
 // Disconnect while the first query is still in flight, before its latency elapses.
 setTimeout(() => {
 req.destroy();
 resolve();
 }, QUERY_LATENCY_MS / 2);
 });
}

async function main() {
 installMocks(QUERY_LATENCY_MS);
 const app = await buildServer();
 await app.listen({ port: 0 });
 const address = app.server.address();
 const port = typeof address === 'object' && address ? address.port : 0;

 console.log('=== Cancelable: client disconnects mid-search ===');
 resetQueryLog();
 await requestThenDisconnect(port);
 // Give the canceled chain a beat to settle before reading the log.
 await sleep(QUERY_LATENCY_MS * 4);

 const issued = queryLog.map((q) => q.op) as string[];
 console.log('Queries issued:', issued.join(', ') || '(none)');
 console.log(
 'Queries skipped after cancel:',
 ['loadRates', 'aggregateOccupancy'].filter((op) => !issued.includes(op)).join(', ') || '(none)'
 );

 await app.close();
 console.log('Done.');
}

main().catch((e) => {
 console.error(e);
 process.exit(1);
});
