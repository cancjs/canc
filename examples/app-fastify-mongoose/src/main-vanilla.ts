import http from 'node:http';

import { sleep } from '@shared/util';
import Fastify from 'fastify';

import { searchAvailability } from './availability-service-vanilla';
import { BOOKING_COUNT, installMocks, queryLog, resetQueryLog } from './mock/db';

// Each query is held open for this long so a disconnect can land between two of them.
const QUERY_LATENCY_MS = 50;
// Documents the scan must get through before the late scenario drops the socket.
const SCAN_PROGRESS_BEFORE_DISCONNECT = 4;
// Long enough for the whole chain, scan included, to finish for a socket nobody is listening to.
const SETTLE_MS = 1000;

async function buildServer() {
  const app = Fastify();

  app.get<{ Querystring: { hotelId?: string; date?: string } }>('/availability', async (request, reply) => {
    const hotelId = request.query.hotelId ?? 'grand-plaza';
    const date = request.query.date ?? '2026-08-01';

    // no cancellation counterpart, this runs to completion even for a dead socket
    const result = await searchAvailability(hotelId, date);
    return reply.send(result);
  });

  return app;
}

// Report helpers, instrumentation only. They read the mock's query log, never the business logic.
function reportIssuedQueries(): string[] {
  return queryLog.map((entry) => entry.op);
}

function reportScannedBookings(): number {
  return queryLog.find((entry) => entry.op === 'scanBookings')?.documentsScanned ?? 0;
}

// Fire a request, then destroy the socket as soon as the scenario's moment arrives. Polling the
// query log instead of a fixed delay keeps both scenarios landing where they are meant to.
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

  console.log('=== Vanilla: client disconnects during the first query ===');
  resetQueryLog();
  await requestThenDisconnect(port, () => reportIssuedQueries().includes('findRooms'));
  // Give the uncancelable chain time to run every query for the dead socket.
  await sleep(SETTLE_MS);
  console.log('Queries issued:', reportIssuedQueries().join(', ') || '(none)');
  console.log(
    'Queries still run after disconnect:',
    ['loadRates', 'scanBookings'].filter((op) => reportIssuedQueries().includes(op)).join(', ') || '(none)',
  );

  console.log('=== Vanilla: client disconnects during the booking scan ===');
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
