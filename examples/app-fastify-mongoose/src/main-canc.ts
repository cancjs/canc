import '@cancjs/unhandled-rejection/register';

import http from 'node:http';

import * as canc from '@cancjs/coroutine';
import { sleep } from '@shared/util';
import Fastify from 'fastify';

import { searchAvailability } from './availability-service-canc';
import { cancAsyncRoute } from './lib/cancelable-route';
import { BOOKING_COUNT, installMocks, queryLog, resetQueryLog } from './mock/db';

// query latency window allowing mid-flight disconnect
const QUERY_LATENCY_MS = 50;
// progress threshold before late disconnect
const SCAN_PROGRESS_BEFORE_DISCONNECT = 4;
// settle window for all queries to finish
const SETTLE_MS = 1000;

async function buildServer() {
  const app = Fastify();

  app.get<{ Querystring: { hotelId?: string; date?: string } }>(
    '/availability',
    cancAsyncRoute(function* (request, reply) {
      const hotelId = (request.query as { hotelId?: string }).hotelId ?? 'grand-plaza';
      const date = (request.query as { date?: string }).date ?? '2026-08-01';

      const result = yield* canc.await(searchAvailability(hotelId, date));
      reply.send(result); // handler owns response, full control
    }),
  );

  return app;
}

// instrumentation helpers reading mock query log
function reportIssuedQueries(): string[] {
  return queryLog.map((entry) => entry.op);
}

function reportScannedBookings(): number {
  return queryLog.find((entry) => entry.op === 'scanBookings')?.documentsScanned ?? 0;
}

// polls query log to trigger disconnect at exact scenario step
function requestThenDisconnect(port: number, hasReachedMoment: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const req = http.get({ port, path: '/availability?hotelId=grand-plaza&date=2026-08-01' }, () => {});
    req.on('error', () => {});
    const startedAt = Date.now();
    const poll = setInterval(() => {
      if (!hasReachedMoment() && Date.now() - startedAt < SETTLE_MS) return;
      clearInterval(poll);
      req.destroy();
      resolve();
    }, 5);
  });
}

async function main() {
  installMocks(QUERY_LATENCY_MS);
  const app = await buildServer();
  await app.listen({ port: 0 });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  console.log('=== Cancelable: client disconnects during the first query ===');
  resetQueryLog();
  await requestThenDisconnect(port, () => reportIssuedQueries().includes('findRooms'));
  // let canceled chain settle before checking log
  await sleep(SETTLE_MS);
  console.log('Queries issued:', reportIssuedQueries().join(', ') || '(none)');
  console.log(
    'Queries skipped after cancel:',
    ['loadRates', 'scanBookings'].filter((op) => !reportIssuedQueries().includes(op)).join(', ') || '(none)',
  );

  console.log('=== Cancelable: client disconnects during the booking scan ===');
  resetQueryLog();
  await requestThenDisconnect(port, () => reportScannedBookings() >= SCAN_PROGRESS_BEFORE_DISCONNECT);
  await sleep(SETTLE_MS);
  console.log('Queries issued:', reportIssuedQueries().join(', ') || '(none)');
  console.log(`Bookings scanned: ${reportScannedBookings()} of ${BOOKING_COUNT}`);

  await app.close();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
