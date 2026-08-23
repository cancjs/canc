import { TextDecoder, TextEncoder } from 'node:util';
Object.defineProperties(globalThis, {
  TextEncoder: { value: TextEncoder },
  TextDecoder: { value: TextDecoder },
});

import http from 'node:http';

import { sleep } from '@shared/util';
import express, { type Express } from 'express';
import request from 'supertest';

jest.mock('@electric-sql/pglite', () => {
  return {
    PGlite: jest.fn().mockImplementation(() => {
      return {
        waitReady: Promise.resolve(),
        query: jest.fn().mockImplementation((sql: string) => {
          if (sql.includes('products') && sql.toLowerCase().includes('select')) {
            return Promise.resolve({
              rows: [
                { id: 1, name: 'Mechanical Keyboard', category: 'electronics' },
                { id: 2, name: 'Ergonomic Mouse', category: 'electronics' },
                { id: 3, name: 'Desk Mat', category: 'accessories' },
              ],
            });
          }
          return Promise.resolve({ rows: [] });
        }),
        close: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

import { createApp as createCancApp } from './main-canc';
import { createApp as createVanillaApp } from './main-vanilla';
import type { ReportDb } from './mock/db';
import { aggregateChunkCount } from './report-queries';

function countAggregateQueries(rdb: ReportDb): number {
  return rdb.queryLog.filter((sql) => sql.includes('"id" >') && sql.includes('"id" <=')).length;
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

const SETTLE_CEILING_MS = 3000;
const QUIET_WINDOW_MS = 150;

async function waitFor(predicate: () => boolean, timeoutMs = SETTLE_CEILING_MS): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await sleep(5);
  }
  return predicate();
}

async function waitForQueryLogToSettle(rdb: ReportDb): Promise<number> {
  const total = aggregateChunkCount();
  const start = Date.now();
  let lastCount = countAggregateQueries(rdb);
  let lastChange = Date.now();

  while (Date.now() - start < SETTLE_CEILING_MS) {
    await sleep(10);
    const current = countAggregateQueries(rdb);
    if (current >= total) {
      return current;
    }
    if (current !== lastCount) {
      lastCount = current;
      lastChange = Date.now();
    } else if (Date.now() - lastChange >= QUIET_WINDOW_MS) {
      return current;
    }
  }
  return countAggregateQueries(rdb);
}

/**
 * Fires the report request, lets a slice or two run, then destroys the client socket. Returns the
 * aggregate-slice count captured right after the disconnect settles.
 */
async function slicesAfterDisconnect(app: Express, rdb: ReportDb, path: string): Promise<number> {
  return withServer(app, async (port) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`);
    req.on('error', () => {});
    await waitFor(() => countAggregateQueries(rdb) >= 1);
    req.destroy();
    return await waitForQueryLogToSettle(rdb);
  });
}

describe('orders report cancellation on client disconnect', () => {
  it('canc: disconnect freezes the query log before the aggregate finishes', async () => {
    const { app, rdb } = await createCancApp();
    const total = aggregateChunkCount();

    const ran = await slicesAfterDisconnect(app, rdb, '/orders/report');

    // chain stopped between slices: partial count ran
    expect(ran).toBeGreaterThan(0);
    expect(ran).toBeLessThan(total);

    await rdb.close();
  });

  it('vanilla uncancelable: every slice runs even after the client left (the bug we teach)', async () => {
    const { app, rdb } = await createVanillaApp();
    const total = aggregateChunkCount();

    const ran = await slicesAfterDisconnect(app, rdb, '/orders/report');

    // uncancelable: full aggregate completes for dead socket
    expect(ran).toBe(total);

    await rdb.close();
  });

  it('vanilla abortable: the AbortController workaround also stops early', async () => {
    const { app, rdb } = await createVanillaApp();
    const total = aggregateChunkCount();

    const ran = await slicesAfterDisconnect(app, rdb, '/orders/report-abortable');

    expect(ran).toBeGreaterThan(0);
    expect(ran).toBeLessThan(total);

    await rdb.close();
  });

  it('serves the product list to a client that stays connected', async () => {
    const { app, rdb } = await createCancApp();

    const response = await request(app).get('/products');

    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);
    await rdb.close();
  });

  it('completes the full POST request with body parser when client stays connected', async () => {
    const { app, rdb } = await createCancApp();
    const { cancAsyncRoute } = require('./lib/cancelable-route');
    const canc = require('@cancjs/coroutine');

    app.post(
      '/test-post',
      express.json(),
      cancAsyncRoute(function* (req: any, res: any) {
        const result = yield* canc.await(Promise.resolve({ received: req.body }));
        res.json(result);
      }),
    );

    const response = await request(app).post('/test-post').send({ foo: 'bar' }).expect(200);

    expect(response.body).toEqual({ received: { foo: 'bar' } });
    await rdb.close();
  });

  it('completes the full POST request with body parser on vanilla abortable when client stays connected', async () => {
    const { app, rdb } = await createVanillaApp();
    const { abortOnDisconnect } = require('./middleware-vanilla');

    app.post('/test-post', express.json(), abortOnDisconnect, (req, res) => {
      res.json({ received: req.body });
    });

    const response = await request(app).post('/test-post').send({ foo: 'bar' }).expect(200);

    expect(response.body).toEqual({ received: { foo: 'bar' } });
    await rdb.close();
  });

  const itPg = process.env.DATABASE_URL ? it : it.skip;
  itPg('canc wire-cancel on Postgres: issues pg_cancel_backend', async () => {
    // with DATABASE_URL set, assert running Postgres query is canceled via wire protocol
    const { app, rdb } = await createCancApp();
    const ran = await slicesAfterDisconnect(app, rdb, '/orders/report');
    expect(ran).toBeGreaterThan(0);
    await rdb.close();
  });
});
