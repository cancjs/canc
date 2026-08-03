import http from 'node:http';

import * as canc from '@cancjs/coroutine';
import { sleep } from '@shared/util';
import Fastify, { FastifyInstance } from 'fastify';

import { searchAvailability as searchCanc } from './availability-service-canc';
import { searchAvailability as searchVanilla } from './availability-service-vanilla';
import { cancAsyncRoute } from './lib/cancelable-route';
import { BOOKING_COUNT, installMocks, queryLog, resetQueryLog } from './mock/db';

const QUERY_LATENCY_MS = 50;
const SCAN_PROGRESS_BEFORE_DISCONNECT = 4;
const SETTLE_MS = 1000;

async function buildServer(flavor: 'canc' | 'vanilla'): Promise<FastifyInstance> {
  const app = Fastify();
  if (flavor === 'canc') {
    app.get(
      '/availability',
      cancAsyncRoute(function* (_request, reply) {
        const result = yield* canc.await(searchCanc('grand-plaza', '2026-08-01'));
        reply.send(result);
      }),
    );
  } else {
    app.get('/availability', async (_request, reply) => {
      const result = await searchVanilla('grand-plaza', '2026-08-01');
      return reply.send(result);
    });
  }
  return app;
}

function issuedQueries(): string[] {
  return queryLog.map((entry) => entry.op);
}

function scannedBookings(): number {
  return queryLog.find((entry) => entry.op === 'scanBookings')?.documentsScanned ?? 0;
}

// Destroys the socket once the scenario's moment arrives. Polling the query log instead of waiting
// a fixed time keeps both scenarios landing where they are meant to on a slow machine.
function requestThenDisconnect(port: number, hasReachedMoment: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const req = http.get({ port, path: '/availability' }, () => {});
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

async function portOf(app: FastifyInstance): Promise<number> {
  await app.listen({ port: 0 });
  const address = app.server.address();
  return typeof address === 'object' && address ? address.port : 0;
}

describe('app-fastify-mongoose availability search', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    installMocks(QUERY_LATENCY_MS);
    resetQueryLog();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('cancels the query chain on an early disconnect, skipping the later queries', async () => {
    app = await buildServer('canc');
    const port = await portOf(app);

    await requestThenDisconnect(port, () => issuedQueries().includes('findRooms'));
    await sleep(SETTLE_MS);

    // First query started before the disconnect landed.
    expect(issuedQueries()).toContain('findRooms');
    // Chain-cancel froze the log here: the later queries were never issued.
    expect(issuedQueries()).not.toContain('loadRates');
    expect(issuedQueries()).not.toContain('scanBookings');
  });

  it('vanilla keeps querying after an early disconnect (the bug this example teaches)', async () => {
    app = await buildServer('vanilla');
    const port = await portOf(app);

    await requestThenDisconnect(port, () => issuedQueries().includes('findRooms'));
    await sleep(SETTLE_MS);

    // Uncancelable: every query runs for the dead socket.
    expect(issuedQueries()).toContain('findRooms');
    expect(issuedQueries()).toContain('loadRates');
    expect(issuedQueries()).toContain('scanBookings');
  });

  it('stops the booking scan where it stands on a late disconnect', async () => {
    app = await buildServer('canc');
    const port = await portOf(app);

    await requestThenDisconnect(port, () => scannedBookings() >= SCAN_PROGRESS_BEFORE_DISCONNECT);
    await sleep(SETTLE_MS);

    expect(issuedQueries()).toContain('scanBookings');
    // Partial scan: some documents were walked, the rest never were.
    expect(scannedBookings()).toBeGreaterThan(0);
    expect(scannedBookings()).toBeLessThan(BOOKING_COUNT);
  });

  it('vanilla walks every booking after a late disconnect', async () => {
    app = await buildServer('vanilla');
    const port = await portOf(app);

    await requestThenDisconnect(port, () => scannedBookings() >= SCAN_PROGRESS_BEFORE_DISCONNECT);
    await sleep(SETTLE_MS);

    expect(issuedQueries()).toContain('scanBookings');
    expect(scannedBookings()).toBe(BOOKING_COUNT);
  });
});
