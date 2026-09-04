import { once } from 'node:events';
import { createServer, IncomingMessage, request as sendRequest, Server, ServerResponse } from 'node:http';
import { AddressInfo, connect, Socket } from 'node:net';

import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';
import { serve } from '@hono/node-server';
import express from 'express';
import Fastify, { FastifyInstance } from 'fastify';
import { Hono } from 'hono';
import Koa from 'koa';

import * as expressServer from './canc-server-express/src';
import * as fastifyServer from './canc-server-fastify/src';
import * as honoServer from './canc-server-hono/src';
import * as koaServer from './canc-server-koa/src';
import * as nodeServer from './canc-server-node/src';

/**
 * End-to-end checks for the whole server family against real sockets.
 *
 * The per-package suites cover semantics; this one covers the three things only a live connection
 * can show, once per package: a client that leaves mid-handler is noticed, a handler wrapped long
 * after its body was read is not mistaken for one, and a shutdown cancels what is still in flight.
 */

const servers: Server[] = [];
const sockets: Socket[] = [];
const apps: FastifyInstance[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.destroy();
  }

  for (const app of apps.splice(0)) {
    await app.close();
  }

  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('raw node', () => {
  it('cancels a handler whose client leaves mid-flight', async () => {
    const started = deferred();
    const unwound = deferred();
    const disconnects: CancelError[] = [];
    let resumed = false;
    let written: { headersSent: boolean; writableEnded: boolean } | undefined;

    const port = await listen(
      createServer(
        nodeServer.cancelableHandler(
          function* (_req: IncomingMessage, res: ServerResponse) {
            started.resolve();

            try {
              yield never();
              resumed = true;
              res.end('unreachable');
            } finally {
              written = { headersSent: res.headersSent, writableEnded: res.writableEnded };
              unwound.resolve();
            }
          },
          { onDisconnect: (reason) => disconnects.push(reason) },
        ),
      ),
    );

    const client = await rawRequest(port, 'GET /hang HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await started.promise;
    client.destroy();
    await unwound.promise;

    expectDisconnect(disconnects);
    expect(resumed).toBe(false);
    expect(written).toEqual({ headersSent: false, writableEnded: false });
  });

  it('leaves a body carrying post alone when the wrapper is installed late', async () => {
    const disconnects: CancelError[] = [];
    let destroyedAtWrap: boolean | undefined;

    const port = await listen(
      createServer((req, res) => {
        void (async () => {
          const body = await readBody(req);
          await ticks();
          destroyedAtWrap = req.destroyed;

          nodeServer.cancelableHandler(
            function* (_lateReq: IncomingMessage, lateRes: ServerResponse) {
              yield CancelablePromise.resolve();
              lateRes.end(body);
            },
            { onDisconnect: (reason) => disconnects.push(reason) },
          )(req, res);
        })();
      }),
    );

    const response = await httpRequest(port, { body: 'kept', method: 'POST', path: '/echo' });

    expectLateWrapHazard(destroyedAtWrap);
    expect(response).toEqual({ body: 'kept', status: 200 });
    expect(disconnects).toEqual([]);
  });

  it('shuts down a live request', async () => {
    const started = deferred();

    const port = await listen(
      createServer(
        nodeServer.cancelableHandler(function* (_req: IncomingMessage, res: ServerResponse) {
          started.resolve();
          yield never();
          res.end('unreachable');
        }),
      ),
    );

    const pending = httpRequest(port, { path: '/hang' });
    await started.promise;
    const result = await nodeServer.shutdown(lastServer(), { timeout: 5000 });

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect((await pending).status).toBe(503);
    expect(lastServer().listening).toBe(false);
  });
});

describe('express', () => {
  it('cancels a handler whose client leaves mid-flight', async () => {
    const started = deferred();
    const unwound = deferred();
    const disconnects: CancelError[] = [];
    let resumed = false;
    let headersSent: boolean | undefined;

    const app = express();
    app.use(expressServer.cancelMiddleware());
    app.get(
      '/hang',
      expressServer.cancelableHandler(
        function* (_req, res) {
          started.resolve();

          try {
            yield never();
            resumed = true;
            res.send('unreachable');
          } finally {
            headersSent = res.headersSent;
            unwound.resolve();
          }
        },
        { onDisconnect: (reason) => disconnects.push(reason) },
      ),
    );
    app.use(expressServer.cancelErrorHandler());

    const port = await listen(createServer(app));
    const client = await rawRequest(port, 'GET /hang HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await started.promise;
    client.destroy();
    await unwound.promise;

    expectDisconnect(disconnects);
    expect(resumed).toBe(false);
    expect(headersSent).toBe(false);
  });

  it('leaves a body carrying post alone when the wrapper is installed late', async () => {
    const disconnects: CancelError[] = [];
    let destroyedAtWrap: boolean | undefined;

    // no cancelMiddleware on purpose: mounting it installs the signal before the body is
    // parsed, while an interceptor or a route factory reaches the request long after
    const app = express();
    app.post('/echo', (req, res, next) => {
      void (async () => {
        const body = await readBody(req);
        await ticks();
        destroyedAtWrap = req.destroyed;

        expressServer.cancelableHandler(
          function* (_lateReq, lateRes) {
            yield CancelablePromise.resolve();
            lateRes.send(body);
          },
          { onDisconnect: (reason) => disconnects.push(reason) },
        )(req, res, next);
      })();
    });

    const port = await listen(createServer(app));
    const response = await httpRequest(port, { body: 'kept', method: 'POST', path: '/echo' });

    expectLateWrapHazard(destroyedAtWrap);
    expect(response).toEqual({ body: 'kept', status: 200 });
    expect(disconnects).toEqual([]);
  });

  it('shuts down a live request', async () => {
    const started = deferred();

    const app = express();
    app.get(
      '/hang',
      expressServer.cancelableHandler(function* (_req, res) {
        started.resolve();
        yield never();
        res.send('unreachable');
      }),
    );
    app.use(expressServer.cancelErrorHandler());

    const port = await listen(createServer(app));
    const pending = httpRequest(port, { path: '/hang' });
    await started.promise;
    const result = await expressServer.shutdown(lastServer(), { timeout: 5000 });

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect((await pending).status).toBe(503);
    expect(lastServer().listening).toBe(false);
  });
});

describe('koa', () => {
  it('cancels a handler whose client leaves mid-flight', async () => {
    const started = deferred();
    const unwound = deferred();
    const disconnects: CancelError[] = [];
    let resumed = false;
    let headersSent: boolean | undefined;

    const app = new Koa();
    app.silent = true;
    app.use(koaServer.cancelMiddleware());
    app.use(
      koaServer.cancelableHandler(
        function* (ctx) {
          started.resolve();

          try {
            yield never();
            resumed = true;
            ctx.body = 'unreachable';
          } finally {
            headersSent = ctx.res.headersSent;
            unwound.resolve();
          }
        },
        { onDisconnect: (reason) => disconnects.push(reason) },
      ),
    );

    const port = await listenKoa(app);
    const client = await rawRequest(port, 'GET /hang HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await started.promise;
    client.destroy();
    await unwound.promise;

    expectDisconnect(disconnects);
    expect(resumed).toBe(false);
    expect(headersSent).toBe(false);
  });

  it('leaves a body carrying post alone when the wrapper is installed late', async () => {
    const disconnects: CancelError[] = [];
    let destroyedAtWrap: boolean | undefined;

    const app = new Koa();
    app.silent = true;
    app.use(async (ctx) => {
      const body = await readBody(ctx.req);
      await ticks();
      destroyedAtWrap = ctx.req.destroyed;

      await koaServer.cancelableHandler(
        function* (context) {
          yield CancelablePromise.resolve();
          context.body = body;
        },
        { onDisconnect: (reason) => disconnects.push(reason) },
      )(ctx);
    });

    const port = await listenKoa(app);
    const response = await httpRequest(port, { body: 'kept', method: 'POST', path: '/echo' });

    expectLateWrapHazard(destroyedAtWrap);
    expect(response).toEqual({ body: 'kept', status: 200 });
    expect(disconnects).toEqual([]);
  });

  it('shuts down a live request', async () => {
    const started = deferred();

    const app = new Koa();
    app.silent = true;
    app.use(koaServer.cancelMiddleware());
    app.use(
      koaServer.cancelableHandler(function* (ctx) {
        started.resolve();
        yield never();
        ctx.body = 'unreachable';
      }),
    );

    const port = await listenKoa(app);
    const pending = httpRequest(port, { path: '/hang' });
    await started.promise;
    const result = await koaServer.shutdown(lastServer(), { timeout: 5000 });

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect((await pending).status).toBe(503);
    expect(lastServer().listening).toBe(false);
  });
});

describe('fastify', () => {
  it('cancels a handler whose client leaves mid-flight', async () => {
    const started = deferred();
    const unwound = deferred();
    const disconnects: CancelError[] = [];
    let resumed = false;
    let headersSent: boolean | undefined;

    const app = Fastify();
    await app.register(fastifyServer.cancelPlugin);
    app.setErrorHandler(fastifyServer.cancelErrorHandler());
    app.get(
      '/hang',
      fastifyServer.cancelableHandler(
        function* (_request, reply) {
          started.resolve();

          try {
            yield never();
            resumed = true;

            return { ok: true };
          } finally {
            headersSent = reply.raw.headersSent;
            unwound.resolve();
          }
        },
        { onDisconnect: (reason) => disconnects.push(reason) },
      ),
    );

    const port = await listenFastify(app);
    const client = await rawRequest(port, 'GET /hang HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await started.promise;
    client.destroy();
    await unwound.promise;
    await ticks();

    expectDisconnect(disconnects);
    expect(resumed).toBe(false);
    expect(headersSent).toBe(false);
    expect(app.server.listening).toBe(true);
  });

  it('leaves a body carrying post alone when the wrapper is installed late', async () => {
    const disconnects: CancelError[] = [];
    let destroyedAtWrap: boolean | undefined;

    // plugin left out like the express middleware above: it installs at onRequest,
    // before the body is read, so the route below is the only late install
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      await ticks();
      destroyedAtWrap = request.raw.destroyed;
    });
    app.post(
      '/echo',
      fastifyServer.cancelableHandler(
        function* (request) {
          yield CancelablePromise.resolve();

          return { got: (request.body as { name: string }).name };
        },
        { onDisconnect: (reason) => disconnects.push(reason) },
      ),
    );

    const port = await listenFastify(app);
    const response = await httpRequest(port, {
      body: JSON.stringify({ name: 'kept' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      path: '/echo',
    });

    expectLateWrapHazard(destroyedAtWrap);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ got: 'kept' });
    expect(disconnects).toEqual([]);
  });

  it('shuts down a live request', async () => {
    const started = deferred();

    const app = Fastify();
    await app.register(fastifyServer.cancelPlugin);
    app.setErrorHandler(fastifyServer.cancelErrorHandler());
    app.get(
      '/hang',
      fastifyServer.cancelableHandler(function* () {
        started.resolve();
        yield never();

        return { ok: true };
      }),
    );

    const port = await listenFastify(app);
    // the shutdown closes the connection on its way out, so this one is never read back
    httpRequest(port, { path: '/hang' }).catch(() => undefined);
    await started.promise;
    const result = await fastifyServer.shutdown(app, { timeout: 5000 });

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect(app.server.listening).toBe(false);
  });
});

describe('hono on node', () => {
  it('cancels a handler whose client leaves mid-flight', async () => {
    const started = deferred();
    const unwound = deferred();
    const disconnects: CancelError[] = [];
    let resumed = false;
    let headersSent: boolean | undefined;

    const app = new Hono();
    app.onError(honoServer.cancelErrorHandler());
    app.use(honoServer.cancelMiddleware());
    app.get(
      '/hang',
      honoServer.cancelableHandler(
        function* (c) {
          started.resolve();

          try {
            yield never();
            resumed = true;

            return c.text('unreachable');
          } finally {
            headersSent = outgoingOf(c.env).headersSent;
            unwound.resolve();
          }
        },
        { onDisconnect: (reason) => disconnects.push(reason) },
      ),
    );

    const port = await listenHono(app);
    const client = await rawRequest(port, 'GET /hang HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await started.promise;
    client.destroy();
    await unwound.promise;
    await ticks();

    expectDisconnect(disconnects);
    expect(resumed).toBe(false);
    expect(headersSent).toBe(false);
  });

  it('leaves a body carrying post alone when the wrapper is installed late', async () => {
    const disconnects: CancelError[] = [];
    let destroyedAtWrap: boolean | undefined;
    let parsed = '';

    // the middleware reads the body then waits, so the wrapper below installs the
    // signal several turns after the request stream finished
    const app = new Hono();
    app.use('/echo', async (c, next) => {
      parsed = await c.req.text();
      await ticks();
      destroyedAtWrap = incomingOf(c.env).destroyed;
      await next();
    });
    app.post(
      '/echo',
      honoServer.cancelableHandler(
        function* (c) {
          yield CancelablePromise.resolve();

          return c.text(parsed);
        },
        { onDisconnect: (reason) => disconnects.push(reason) },
      ),
    );

    const port = await listenHono(app);
    const response = await httpRequest(port, { body: 'kept', method: 'POST', path: '/echo' });

    expectLateWrapHazard(destroyedAtWrap);
    expect(response).toEqual({ body: 'kept', status: 200 });
    expect(disconnects).toEqual([]);
  });

  it('shuts down a live request', async () => {
    const started = deferred();

    const app = new Hono();
    app.onError(honoServer.cancelErrorHandler());
    app.use(honoServer.cancelMiddleware());
    app.get(
      '/hang',
      honoServer.cancelableHandler(function* (c) {
        started.resolve();
        yield never();

        return c.text('unreachable');
      }),
    );

    const port = await listenHono(app);
    httpRequest(port, { path: '/hang' }).catch(() => undefined);
    await started.promise;
    const result = await honoServer.shutdown(lastServer(), { timeout: 5000 });

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect(lastServer().listening).toBe(false);
  });
});

function expectDisconnect(disconnects: CancelError[]): void {
  expect(disconnects).toHaveLength(1);
  expect(isCancelError(disconnects[0])).toBe(true);
  expect(disconnects[0].timedOut).toBe(false);
}

// a request stream read to the end destroys itself, so a late wrapper meets an incoming
// message already destroyed with the socket still open, and the tests calling this prove
// nothing once that stops being true
function expectLateWrapHazard(destroyedAtWrap: boolean | undefined): void {
  expect(destroyedAtWrap).toBe(true);
}

interface INodeBindings {
  incoming: IncomingMessage;
  outgoing: ServerResponse;
}

function incomingOf(env: unknown): IncomingMessage {
  return (env as INodeBindings).incoming;
}

function outgoingOf(env: unknown): ServerResponse {
  return (env as INodeBindings).outgoing;
}

/** Reads a request body to completion, standing in for a body parser. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Work that never settles on its own, standing in for a query still in flight. */
function never(): CancelablePromise<never> {
  return new CancelablePromise<never>(() => {
    /**/
  });
}

/** Several turns of the event loop, which is what late means here. */
function ticks(times = 5): Promise<void> {
  let chain = Promise.resolve();

  for (let index = 0; index < times; index += 1) {
    chain = chain.then(() => new Promise<void>((resolve) => setImmediate(resolve)));
  }

  return chain;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

async function listen(server: Server): Promise<number> {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return portOf(server);
}

// koa's own entry point rather than createServer(app.callback()): the callback returns a promise
// and a request listener returns nothing, so wiring the two by hand is a mismatch koa itself avoids
async function listenKoa(app: Koa): Promise<number> {
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');

  return portOf(server);
}

async function listenFastify(app: FastifyInstance): Promise<number> {
  apps.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });

  return portOf(app.server);
}

async function listenHono(app: Hono): Promise<number> {
  const server = await new Promise<Server>((resolve) => {
    const started = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, () => resolve(started as Server));
  });
  servers.push(server);

  return portOf(server);
}

function lastServer(): Server {
  return servers[servers.length - 1];
}

function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a bound tcp address');
  }

  return (address as AddressInfo).port;
}

/** A raw connection the test can drop mid-handler, which a pooled http client will not do. */
async function rawRequest(port: number, payload: string): Promise<Socket> {
  const client = connect(port, '127.0.0.1');
  sockets.push(client);
  // destroying this resets the peer, and an unhandled 'error' would kill the run
  client.on('error', () => {});
  await once(client, 'connect');
  client.write(payload);

  return client;
}

interface IHttpOptions {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function httpRequest(port: number, options: IHttpOptions): Promise<{ body: string; status: number }> {
  return new Promise((resolve, reject) => {
    const headers = { ...options.headers };
    if (options.body !== undefined) {
      headers['content-length'] = String(Buffer.byteLength(options.body));
    }

    const outgoing = sendRequest(
      {
        headers,
        host: '127.0.0.1',
        method: options.method ?? 'GET',
        path: options.path,
        port,
      },
      (incoming: IncomingMessage) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () =>
          resolve({ body: Buffer.concat(chunks).toString('utf8'), status: incoming.statusCode ?? 0 }),
        );
      },
    );

    outgoing.on('error', reject);

    if (options.body !== undefined) {
      outgoing.write(options.body);
    }

    outgoing.end();
  });
}
