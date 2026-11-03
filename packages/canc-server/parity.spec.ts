import { once } from 'node:events';
import { IncomingMessage, request as sendRequest, Server } from 'node:http';
import { AddressInfo } from 'node:net';

import { CancelablePromise, CancelError } from '@cancjs/promise';
import { serve } from '@hono/node-server';
import express from 'express';
import Fastify, { FastifyInstance, FastifyReply } from 'fastify';
import { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import Koa from 'koa';

import * as expressServer from './canc-server-express/src';
import * as fastifyServer from './canc-server-fastify/src';
import * as honoServer from './canc-server-hono/src';
import * as koaServer from './canc-server-koa/src';

/*
 * Parity of the framework adapters with the bare framework.
 *
 * The same failure is raised through every way of mounting the adapter, and what the client and the
 * app can observe must be identical: status, the headers an app cares about, body, log lines, app
 * level events and fastify hooks.
 *
 * The node adapter has no block: it has no framework twin to compare against, so the plain, wrapped
 * and handler modes do not apply to it and its own suite covers it.
 *
 * Modes:
 *   P   plain route, nothing from the adapter mounted
 *   W   route wrapped with `cancelableHandler`
 *   M   W plus the request signal middleware (or plugin)
 *   H   W plus the adapter's error handler
 *   U   plain route behind the app's own error handler
 *   WU  W behind the app's own error handler
 *   HU  W with the adapter's error handler placed after, or around, the app's own
 *   UH  W with the adapter's error handler placed before the app's own
 *
 * Failures that the request does not own (a cancel thrown by the app, a plain 429 carrying headers)
 * must come out the same in every mode of a group; mounting the adapter changes nothing. Failures
 * the adapter mints (a deadline, a shutdown) have no plain counterpart, so they must come out the
 * same in every mode that wraps the route, apart from the listed deltas.
 *
 * Deltas that are expected, each by design:
 *
 * | Delta                                   | Where                  | Why                                                           |
 * | --------------------------------------- | ---------------------- | ------------------------------------------------------------- |
 * | Disconnect swallowed                    | every adapter          | the client is gone, so nothing is written and nothing is logged |
 * | Head-sent cut                           | every adapter          | a sent head takes no status, so the socket is cut and surfaced |
 * | Late arrivals served during a shutdown  | express, koa, node, hono | the server has no lifecycle of its own, so the drain owns it  |
 * | Quiet body on the terminal handler      | express, H on owned    | the handler answers a bare status, finalhandler would log and send html |
 * | App handler skipped for owned cancels   | fastify and hono, HU   | one error slot: the adapter's handler answers a cancel the request owns, and its `onError` option only takes what is not a cancel |
 * | Unowned cancel not given to the app     | fastify, HU            | the adapter's handler passes a cancel the request does not own to the framework default, not to its `onError` option |
 * | Log prefix on an unhandled error        | hono, H                | the handler logs an error nobody owns under the package prefix |
 *
 * The first three are connection level and covered by the per-package suites; the rest are asserted
 * below, each against the mode it is documented to behave like.
 */

type TMode = 'P' | 'W' | 'M' | 'H' | 'U' | 'WU' | 'HU' | 'UH';
interface IHttpError extends Error {
  status?: number;
  statusCode?: number;
}

type TKind = 'cancel' | 'rate-limit' | 'deadline' | 'shutdown';

interface IObserved {
  status: number;
  headers: Record<string, string>;
  body: string;
  logs: string[];
  events: string[];
}

interface IHarness {
  started: { promise: Promise<void>; resolve: () => void };
  logs: string[];
  events: string[];
}

interface IRunning {
  port: number;
  shutdown?: (options: Record<string, unknown>) => Promise<unknown>;
}

interface IAdapter {
  name: string;
  modes: TMode[];
  build: (mode: TMode, kind: TKind, harness: IHarness, stops: Array<() => Promise<void>>) => Promise<IRunning>;
  // the mode a mode is documented to behave like, when that is not the baseline of its group
  reference?: (mode: TMode, kind: TKind) => TMode | undefined;
  // expected changes of a mode against its reference
  delta?: (mode: TMode, kind: TKind, base: IObserved) => IObserved;
}

const KINDS: TKind[] = ['cancel', 'rate-limit', 'deadline', 'shutdown'];
const MINTED: TKind[] = ['deadline', 'shutdown'];
const WRAPPED: TMode[] = ['W', 'M', 'H', 'WU', 'HU', 'UH'];
const WITH_USER_HANDLER: TMode[] = ['U', 'WU', 'HU', 'UH'];

const SHUTDOWN_OPTIONS = { cancelAfter: 0, closeAfter: 2000, headers: { 'retry-after': '5' }, status: 502 };
const DEADLINE = { headers: { 'retry-after': '3' }, ms: 20, status: 504 };

const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  jest.restoreAllMocks();

  for (const stop of stops.splice(0)) {
    await stop();
  }
});

const adapters: IAdapter[] = [
  {
    build: buildExpress,
    delta: (mode, kind, base) =>
      mode === 'H' && MINTED.includes(kind) ?
        { ...base, body: '', headers: omit(base.headers, 'content-type'), logs: [] }
      : base,
    modes: ['P', 'W', 'M', 'H', 'U', 'WU', 'HU'],
    name: 'express',
  },
  { build: buildKoa, modes: ['P', 'W', 'H', 'U', 'WU', 'HU', 'UH'], name: 'koa' },
  {
    build: buildFastify,
    modes: ['P', 'W', 'M', 'H', 'U', 'WU', 'HU'],
    name: 'fastify',
    reference: (mode, kind) => {
      if (mode !== 'HU') {
        return undefined;
      }

      return (
        MINTED.includes(kind) ? 'W'
        : kind === 'cancel' ? 'P'
        : undefined
      );
    },
  },
  {
    build: buildHono,
    delta: (mode, kind, base) =>
      mode === 'H' && kind === 'cancel' ?
        { ...base, logs: base.logs.map((line) => `[@cancjs/server-hono] request handler failed ${line}`) }
      : base,
    modes: ['P', 'W', 'M', 'H', 'U', 'WU', 'HU'],
    name: 'hono',
    reference: (mode, kind) => (mode === 'HU' && MINTED.includes(kind) ? 'W' : undefined),
  },
];

for (const adapter of adapters) {
  describe(`parity ${adapter.name}`, () => {
    for (const kind of KINDS) {
      const minted = MINTED.includes(kind);
      const groups = [
        {
          base: minted ? 'W' : 'P',
          label: 'app default',
          modes: adapter.modes.filter((m) => !WITH_USER_HANDLER.includes(m)),
        },
        {
          base: minted ? 'WU' : 'U',
          label: 'app error handler',
          modes: adapter.modes.filter((m) => WITH_USER_HANDLER.includes(m)),
        },
      ] as Array<{ base: TMode; label: string; modes: TMode[] }>;

      for (const group of groups) {
        const modes = group.modes.filter((mode) => !minted || WRAPPED.includes(mode));

        it(`${kind}: ${modes.join(' ')} match ${group.base} (${group.label})`, async () => {
          const base = await observe(adapter, group.base, kind);
          const mismatches: unknown[] = [];

          for (const mode of modes.filter((m) => m !== group.base)) {
            const referenceMode = adapter.reference?.(mode, kind) ?? group.base;
            const reference = referenceMode === group.base ? base : await observe(adapter, referenceMode, kind);
            const expected = adapter.delta ? adapter.delta(mode, kind, reference) : reference;
            const actual = await observe(adapter, mode, kind);

            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
              mismatches.push({ actual, expected, mode });
            }
          }

          expect(mismatches).toEqual([]);

          // the answer itself, so a mode set that agrees on a wrong answer is still caught
          const answered = { deadline: 504, 'rate-limit': 429, shutdown: 502 }[kind as 'deadline'];

          if (answered !== undefined) {
            expect(base.status).toBe(answered);
          }

          // the app's own handler writes its own headers, so only the default answer carries these
          if (group.base === 'W' || group.base === 'P') {
            const retryAfter = { deadline: '3', 'rate-limit': '7', shutdown: '5' }[kind as 'deadline'];

            if (retryAfter !== undefined) {
              expect(base.headers['retry-after']).toBe(retryAfter);
            }
          }
        });
      }
    }
  });
}

async function observe(adapter: IAdapter, mode: TMode, kind: TKind): Promise<IObserved> {
  const harness: IHarness = { events: [], logs: [], started: deferred() };
  const spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    harness.logs.push(args.map(describe_).join(' '));
  });

  try {
    const running = await adapter.build(mode, kind, harness, stops);
    const pending = get(running.port);

    if (kind === 'shutdown') {
      await harness.started.promise;
      await running.shutdown!(SHUTDOWN_OPTIONS);
    }

    const response = await pending;

    // framework loggers defer their write
    await ticks();

    return { ...response, events: harness.events, logs: harness.logs };
  } finally {
    spy.mockRestore();
  }
}

// routes shared by the adapters

function optionsFor(kind: TKind): { timeout: typeof DEADLINE } | undefined {
  return kind === 'deadline' ? { timeout: DEADLINE } : undefined;
}

// a generator route body; `fail` is what the app throws for the non-minted kinds
function generatorFor(kind: TKind, harness: IHarness, fail: () => Error): () => Generator<unknown, never, unknown> {
  if (kind === 'cancel' || kind === 'rate-limit') {
    return function* (): Generator<unknown, never, unknown> {
      yield CancelablePromise.resolve();
      throw fail();
    };
  }

  return function* (): Generator<unknown, never, unknown> {
    harness.started.resolve();

    return (yield never()) as never;
  };
}

function failureFor(kind: TKind, rateLimit: () => Error): () => Error {
  return kind === 'cancel' ? () => new CancelError('app abort') : rateLimit;
}

function rateLimitError(): Error {
  return Object.assign(new Error('slow down'), { headers: { 'retry-after': '7' }, status: 429, statusCode: 429 });
}

function statusOf(error: IHttpError): number {
  return error.status ?? error.statusCode ?? 500;
}

// express

async function buildExpress(mode: TMode, kind: TKind, harness: IHarness): Promise<IRunning> {
  const app = express();
  // the error logger of express skips the test environment, which would hide the very line compared
  app.set('env', 'development');

  const fail = failureFor(kind, rateLimitError);

  if (mode === 'M') {
    app.use(expressServer.cancelMiddleware());
  }

  if (WRAPPED.includes(mode)) {
    app.get('/r', expressServer.cancelableHandler(generatorFor(kind, harness, fail), optionsFor(kind)));
  } else {
    app.get('/r', () => {
      throw fail();
    });
  }

  if (WITH_USER_HANDLER.includes(mode)) {
    app.use((error: IHttpError, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(statusOf(error)).set('x-user', '1').json({ user: error.message });
    });
  }

  if (mode === 'H' || mode === 'HU') {
    app.use(expressServer.cancelErrorHandler());
  }

  const server = app.listen(0, '127.0.0.1');
  stopLater(server);
  await once(server, 'listening');

  return { port: portOf(server), shutdown: expressServer.createShutdown(server) };
}

// koa

async function buildKoa(mode: TMode, kind: TKind, harness: IHarness): Promise<IRunning> {
  const app = new Koa();
  app.env = 'development';
  // a listener replaces koa's own logger, so the event is what is compared
  app.on('error', (error: IHttpError) => harness.events.push(`error ${error.status ?? ''} ${error.message}`));

  const fail = failureFor(kind, rateLimitError);
  const user: Koa.Middleware = async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      ctx.status = statusOf(error as IHttpError);
      ctx.set('x-user', '1');
      ctx.body = { user: (error as IHttpError).message };
    }
  };

  if (mode === 'UH') {
    app.use(koaServer.cancelMiddleware());
  }

  if (WITH_USER_HANDLER.includes(mode)) {
    app.use(user);
  }

  if (mode === 'H' || mode === 'HU') {
    app.use(koaServer.cancelMiddleware());
  }

  if (WRAPPED.includes(mode)) {
    app.use(koaServer.cancelableHandler(generatorFor(kind, harness, fail), optionsFor(kind)));
  } else {
    app.use(async () => {
      throw fail();
    });
  }

  const server = app.listen(0, '127.0.0.1');
  stopLater(server);
  await once(server, 'listening');

  return { port: portOf(server), shutdown: koaServer.createShutdown(server) };
}

// fastify

async function buildFastify(mode: TMode, kind: TKind, harness: IHarness): Promise<IRunning> {
  const app: FastifyInstance = Fastify({
    logger: {
      level: 'info',
      stream: {
        write: (line: string) => {
          const entry = JSON.parse(line) as { level: number; msg?: string; err?: { message?: string } };

          if (!NOISE.test(entry.msg ?? '')) {
            harness.logs.push(`${entry.level} ${entry.msg ?? ''} ${entry.err?.message ?? ''}`.trim());
          }
        },
      },
    },
  });
  const fail = failureFor(kind, rateLimitError);
  const user = (error: unknown, _request: unknown, reply: FastifyReply): void => {
    reply
      .code(statusOf(error as IHttpError))
      .header('x-user', '1')
      .send({ user: (error as IHttpError).message });
  };

  app.addHook('onError', (_request, _reply, error, done) => {
    harness.events.push(`onError ${error.message}`);
    done();
  });
  app.addHook('onSend', (_request, reply, payload, done) => {
    harness.events.push(`onSend ${reply.statusCode}`);
    done(null, payload);
  });
  app.addHook('onResponse', (_request, reply, done) => {
    harness.events.push(`onResponse ${reply.statusCode}`);
    done();
  });

  if (mode === 'M') {
    await app.register(fastifyServer.cancelPlugin);
  }

  if (mode === 'H') {
    app.setErrorHandler(fastifyServer.cancelErrorHandler());
  } else if (mode === 'HU') {
    app.setErrorHandler(fastifyServer.cancelErrorHandler({ onError: user }));
  } else if (WITH_USER_HANDLER.includes(mode)) {
    app.setErrorHandler(user);
  }

  if (WRAPPED.includes(mode)) {
    app.get('/r', fastifyServer.cancelableHandler(generatorFor(kind, harness, fail), optionsFor(kind)));
  } else {
    app.get('/r', async () => {
      throw fail();
    });
  }

  await app.listen({ host: '127.0.0.1', port: 0 });
  stops.push(() => app.close());

  return { port: portOf(app.server), shutdown: fastifyServer.createShutdown(app) };
}

// hono

async function buildHono(mode: TMode, kind: TKind, harness: IHarness): Promise<IRunning> {
  const app = new Hono();
  const fail = failureFor(kind, () => {
    const headers = { 'retry-after': '7' };

    return new HTTPException(429, { message: 'slow down', res: new Response('slow down', { headers, status: 429 }) });
  });
  const user = (error: IHttpError, c: Context): Response =>
    c.json({ user: error.message }, statusOf(error) as ContentfulStatusCode, { 'x-user': '1' });

  if (mode === 'M') {
    app.use('*', honoServer.cancelMiddleware());
  }

  if (mode === 'H') {
    app.onError(honoServer.cancelErrorHandler());
  } else if (mode === 'HU') {
    app.onError(honoServer.cancelErrorHandler({ onError: user }));
  } else if (WITH_USER_HANDLER.includes(mode)) {
    app.onError(user);
  }

  if (WRAPPED.includes(mode)) {
    app.get('/r', honoServer.cancelableHandler(generatorFor(kind, harness, fail), optionsFor(kind)));
  } else {
    app.get('/r', async () => {
      throw fail();
    });
  }

  const server = await new Promise<Server>((resolve) => {
    const started = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, () => resolve(started as Server));
  });
  stopLater(server);

  return { port: portOf(server), shutdown: honoServer.createShutdown(server) };
}

// helpers

// access lines carry timings and the listening line a port; neither is part of an error's handling
const NOISE = /^(incoming request|request completed|Server listening)/;

const OBSERVED_HEADERS = ['content-type', 'retry-after', 'x-user'];

function get(port: number): Promise<Pick<IObserved, 'body' | 'headers' | 'status'>> {
  return new Promise((resolve, reject) => {
    // a fresh connection per request, so no keep-alive state carries between modes
    const outgoing = sendRequest(
      { headers: { connection: 'close' }, host: '127.0.0.1', path: '/r', port },
      (incoming: IncomingMessage) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () => {
          const headers: Record<string, string> = {};

          for (const name of OBSERVED_HEADERS) {
            const value = incoming.headers[name];

            if (value !== undefined) {
              // the charset suffix is the framework's formatting, not the adapter's
              headers[name] = String(value).replace(/; charset=utf-8$/i, '');
            }
          }

          resolve({
            body: plainBody(Buffer.concat(chunks).toString('utf8')),
            headers,
            status: incoming.statusCode ?? 0,
          });
        });
      },
    );

    outgoing.on('error', reject);
    outgoing.end();
  });
}

// an html error page carries the stack of the throw site, which differs by the path taken to it
function plainBody(body: string): string {
  const match = /<pre>(.*?)<br>/.exec(body);

  return match ? `html:${match[1]}` : body;
}

function stopLater(server: Server): void {
  stops.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
}

function describe_(arg: unknown): string {
  return arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg).split('\n')[0];
}

function omit(record: Record<string, string>, name: string): Record<string, string> {
  const copy = { ...record };
  delete copy[name];

  return copy;
}

function portOf(server: Server): number {
  return (server.address() as AddressInfo).port;
}

// work that never settles on its own, standing in for a query still in flight
function never(): CancelablePromise<never> {
  return new CancelablePromise<never>(() => {
    /**/
  });
}

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
