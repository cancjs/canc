import http from 'node:http';

import * as canc from '@cancjs/coroutine';
import { cancelableHandler } from '@cancjs/server-fastify';
import { sleep } from '@shared/util';
import Fastify, { FastifyInstance } from 'fastify';

import { searchAvailability as searchCanc } from './availability-service-canc';
import { searchAvailability as searchVanilla } from './availability-service-vanilla';
import { BOOKING_COUNT, installMocks, queryLog, resetQueryLog } from './mock/db';

const QUERY_LATENCY_MS = 50;
const SCAN_PROGRESS_BEFORE_DISCONNECT = 4;
const SETTLE_MS = 1000;

async function buildServer(flavor: 'canc' | 'vanilla'): Promise<FastifyInstance> {
  const app = Fastify();
  if (flavor === 'canc') {
    app.get(
      '/availability',
      cancelableHandler(function* (_request, reply) {
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

// polls query log to trigger disconnect at exact scenario step
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

    // first query started before disconnect landed
    expect(issuedQueries()).toContain('findRooms');
    // chain cancel prevented subsequent queries from issuing
    expect(issuedQueries()).not.toContain('loadRates');
    expect(issuedQueries()).not.toContain('scanBookings');
  });

  it('vanilla keeps querying after an early disconnect (the bug this example teaches)', async () => {
    app = await buildServer('vanilla');
    const port = await portOf(app);

    await requestThenDisconnect(port, () => issuedQueries().includes('findRooms'));
    await sleep(SETTLE_MS);

    // uncancelable: all queries run for disconnected socket
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
    // partial scan: stopped mid-way through bookings
    expect(scannedBookings()).toBeGreaterThan(0);
    expect(scannedBookings()).toBeLessThan(BOOKING_COUNT);
  });

  it('vanilla walks every booking after a late disconnect', async () => {
    app = await buildServer('vanilla');
    const port = await portOf(app);

    await requestThenDisconnect(port, () => scannedBookings() >= SCAN_PROGRESS_BEFORE_DISCONNECT);
    const start = Date.now();
    while (scannedBookings() < BOOKING_COUNT && Date.now() - start < 3000) {
      await sleep(10);
    }

    expect(issuedQueries()).toContain('scanBookings');
    expect(scannedBookings()).toBe(BOOKING_COUNT);
  });

  it('completes the full POST request with body parser when client stays connected', async () => {
    app = Fastify();
    app.post(
      '/test-post',
      cancelableHandler(function* (request, reply) {
        const result = yield* canc.await(Promise.resolve({ received: request.body }));
        reply.send(result);
      }),
    );

    const port = await portOf(app);
    const response = await fetch(`http://127.0.0.1:${port}/test-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foo: 'bar' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ received: { foo: 'bar' } });
  });
});
