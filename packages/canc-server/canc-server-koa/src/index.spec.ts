import { CancelablePromise, CancelError, isCancelError, isCancelSignal } from '@cancjs/promise';
import { getEventListeners, once } from 'events';
import { IncomingHttpHeaders, IncomingMessage, request, Server } from 'http';
import Koa, { Context, Middleware, Next } from 'koa';
import { connect, Socket } from 'net';
import { Readable } from 'stream';
import { runInThisContext } from 'vm';

import { expectAbortAt, useDeadlineClock } from '../../../_server/__tests__/deadline-clock';
import { describeShutdownSockets } from '../../../_server/__tests__/shutdown-sockets';
import {
  cancelableHandler,
  cancelMiddleware,
  CLIENT_DISCONNECTED,
  createShutdown,
  getRequestSignal,
  HANDLER_TIMEOUT,
  SERVER_SHUTDOWN,
} from './index';

const servers: Server[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.destroy();
  }

  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/** Routes a middleware to a single path, standing in for a real router none of these specs need. */
function route(path: string, middleware: Middleware): Middleware {
  return (ctx, next) => (ctx.path === path ? middleware(ctx, next) : next());
}

/** Work that never settles on its own, standing in for a query still in flight. */
function never(): CancelablePromise<never> {
  return new CancelablePromise<never>(() => {
    /**/
  });
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

/** Starts an app on an ephemeral port and hands back the port it got. */
async function listen(app: Koa): Promise<number> {
  const server = app.listen(0);
  servers.push(server);
  await once(server, 'listening');

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a bound tcp address');
  }

  return address.port;
}

function lastServer(): Server {
  return servers[servers.length - 1];
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

function httpRequest(port: number, options: IHttpOptions): Promise<{ status: number; body: string }> {
  return httpExchange(port, options).then(({ body, status }) => ({ body, status }));
}

function httpExchange(
  port: number,
  options: IHttpOptions,
): Promise<{ status: number; body: string; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      { headers: options.headers, host: '127.0.0.1', method: options.method ?? 'GET', path: options.path, port },
      (incoming: IncomingMessage) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () =>
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            headers: incoming.headers,
            status: incoming.statusCode ?? 0,
          }),
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

/**
 * Consumes the request stream before the route runs, standing in for a real body-parsing
 * middleware. Event based, like `co-body` (which `koa-bodyparser` itself uses): the async-iterator
 * form of stream consumption auto-destroys the readable side on completion, which would make
 * `req.destroyed` true on a perfectly healthy connection and defeat the very guard this test exists
 * to check.
 */
function readJsonBody(ctx: Context, next: Next): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const chunks: Buffer[] = [];

    ctx.req.on('data', (chunk: Buffer) => chunks.push(chunk));
    ctx.req.on('end', () => {
      (ctx.request as unknown as { body: unknown }).body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      next().then(resolve, reject);
    });
    ctx.req.on('error', reject);
  });
}

describe('client disconnect', () => {
  it('unwinds the handler and answers nothing', async () => {
    const app = new Koa();
    const started = deferred();
    const finished = deferred();
    const disconnects: CancelError[] = [];
    let written: { headersSent: boolean; writableEnded: boolean } | undefined;

    app.use(
      route(
        '/hang',
        cancelableHandler(
          function* (ctx) {
            started.resolve();

            try {
              yield never();
              ctx.body = 'unreachable';
            } finally {
              written = { headersSent: ctx.res.headersSent, writableEnded: ctx.res.writableEnded };
              finished.resolve();
            }
          },
          { onDisconnect: (reason) => disconnects.push(reason) },
        ),
      ),
    );

    const port = await listen(app);
    const client = await rawRequest(port, 'GET /hang HTTP/1.1\r\nHost: localhost\r\n\r\n');

    await started.promise;
    client.destroy();
    await finished.promise;

    expect(written).toEqual({ headersSent: false, writableEnded: false });
    expect(disconnects).toHaveLength(1);
    expect(isCancelError(disconnects[0])).toBe(true);
    expect(disconnects[0].timedOut).toBe(false);
  });

  it('never starts a handler whose client left before it was reached', async () => {
    const app = new Koa();
    const reported = deferred();
    let invoked = 0;

    // the route is held until the connection is provably gone, so the pre-flight guard is
    // what the assertion measures rather than a destroy racing the next server tick; the
    // returned promise stays pending so koa never auto-responds ahead of the close event
    app.use(
      (ctx, next) =>
        new Promise<void>((resolve) => {
          ctx.res.once('close', () => {
            next().then(resolve, resolve);
          });
        }),
    );
    app.use(
      route(
        '/late',
        cancelableHandler(
          function* () {
            invoked += 1;
          },
          { onDisconnect: () => reported.resolve() },
        ),
      ),
    );

    const port = await listen(app);
    const client = await rawRequest(port, 'GET /late HTTP/1.1\r\nHost: localhost\r\n\r\n');
    client.destroy();
    await reported.promise;

    expect(invoked).toBe(0);
  });

  it('nothing is written to a socket that is already gone', async () => {
    const app = new Koa();
    const started = deferred();
    const finished = deferred();
    const writes: Buffer[] = [];

    app.use(
      route(
        '/hang',
        cancelableHandler(function* (ctx) {
          try {
            started.resolve();
            yield never();
            ctx.body = 'unreachable';
          } finally {
            finished.resolve();
          }
        }),
      ),
    );

    const port = await listen(app);
    const client = await rawRequest(port, 'GET /hang HTTP/1.1\r\nHost: localhost\r\n\r\n');

    client.on('data', (chunk: Buffer) => writes.push(chunk));

    await started.promise;
    client.destroy();
    await finished.promise;

    expect(writes).toHaveLength(0);
  });
});

describe('request with a body', () => {
  it('completes a POST behind a body parser instead of canceling it', async () => {
    const app = new Koa();
    const disconnects: CancelError[] = [];

    app.use(readJsonBody);
    app.use(
      route(
        '/echo',
        cancelableHandler(
          function* (ctx) {
            // a real suspension point: a signal wired from the request stream aborts before this
            // resumes, so a regression stops the handler right here instead of answering
            yield CancelablePromise.resolve();
            ctx.body = { echoed: (ctx.request as unknown as { body: { value: string } }).body.value };
          },
          { onDisconnect: (reason) => disconnects.push(reason) },
        ),
      ),
    );

    const port = await listen(app);
    const response = await httpRequest(port, {
      body: JSON.stringify({ value: 'kept' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      path: '/echo',
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ echoed: 'kept' });
    expect(disconnects).toEqual([]);
  });
});

describe('deadline', () => {
  it('answers with the configured status while the client is still connected', async () => {
    const app = new Koa();
    const timeouts: CancelError[] = [];

    app.use(cancelMiddleware());
    app.use(
      route(
        '/slow',
        cancelableHandler(
          function* (ctx) {
            yield never();
            ctx.body = 'unreachable';
          },
          { onTimeout: (reason) => timeouts.push(reason), timeout: { ms: 25, status: 504 } },
        ),
      ),
    );

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/slow' });

    expect(response.status).toBe(504);
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].timedOut).toBe(true);
  });

  it('cuts the connection instead of completing a body whose head already went out', async () => {
    const app = new Koa();

    app.use(cancelMiddleware());
    app.use(
      route(
        '/raw',
        cancelableHandler(
          function* (ctx) {
            ctx.res.writeHead(200, { 'content-type': 'text/plain' });
            ctx.res.write('part1,');
            yield never();
            ctx.body = 'unreachable';
          },
          { timeout: { ms: 25, status: 504 } },
        ),
      ),
    );

    const port = await listen(app);
    const outcome = await new Promise<{ body: string; complete: boolean }>((resolve) => {
      const outgoing = request({ host: '127.0.0.1', path: '/raw', port }, (response) => {
        let body = '';

        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => resolve({ body, complete: response.complete }));
        response.on('error', () => resolve({ body, complete: false }));
      });

      outgoing.on('error', () => resolve({ body: '', complete: false }));
      outgoing.end();
    });

    expect(outcome.complete).toBe(false);
    expect(outcome.body).not.toContain('Cannot write headers');
  });

  it('cuts the connection on a head-sent deadline with only the wrapper mounted', async () => {
    const app = new Koa();

    app.use(
      route(
        '/raw',
        cancelableHandler(
          function* (ctx) {
            ctx.res.writeHead(200, { 'content-type': 'text/plain' });
            ctx.res.write('part1,');
            yield never();
            ctx.body = 'unreachable';
          },
          { timeout: { ms: 25, status: 504 } },
        ),
      ),
    );

    const port = await listen(app);
    const outcome = await new Promise<{ body: string; complete: boolean }>((resolve) => {
      const outgoing = request({ host: '127.0.0.1', path: '/raw', port }, (response) => {
        let body = '';

        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => resolve({ body, complete: response.complete }));
        response.on('error', () => resolve({ body, complete: false }));
      });

      outgoing.on('error', () => resolve({ body: '', complete: false }));
      outgoing.end();
    });

    expect(outcome.complete).toBe(false);
    expect(outcome.body).not.toContain('Cannot write headers');
  });

  it('cuts the connection when a cancel error reaches the middleware after the head went out', async () => {
    const app = new Koa();

    app.use(cancelMiddleware());
    app.use(async (ctx) => {
      ctx.res.writeHead(200, { 'content-type': 'text/plain' });
      ctx.res.write('part1,');
      throw Object.assign(new CancelError('stopped'), { status: 503 });
    });

    const port = await listen(app);
    const outcome = await new Promise<{ body: string; complete: boolean }>((resolve) => {
      const outgoing = request({ host: '127.0.0.1', path: '/', port }, (response) => {
        let body = '';

        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => resolve({ body, complete: response.complete }));
        response.on('error', () => resolve({ body, complete: false }));
      });

      outgoing.on('error', () => resolve({ body: '', complete: false }));
      outgoing.end();
    });

    expect(outcome.complete).toBe(false);
    expect(outcome.body).not.toContain('Cannot write headers');
  });

  it('drops a body the handler already set when answering the deadline', async () => {
    const app = new Koa();

    app.use(cancelMiddleware());
    app.use(
      route(
        '/slow',
        cancelableHandler(
          function* (ctx) {
            ctx.body = { ok: true, saved: 1 };
            yield never();
          },
          { timeout: 25 },
        ),
      ),
    );

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/slow' });

    expect(response.status).toBe(503);
    expect(response.body).toBe('Service Unavailable');
  });

  it('falls back to the default status for the millisecond shorthand', async () => {
    const app = new Koa();

    app.use(cancelMiddleware());
    app.use(
      route(
        '/slow',
        cancelableHandler(
          function* (ctx) {
            yield never();
            ctx.body = 'unreachable';
          },
          { timeout: 25 },
        ),
      ),
    );

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/slow' })).status).toBe(503);
  });
});

describe('middleware options', () => {
  it('are inherited by every route and overridden per route', async () => {
    const app = new Koa();

    app.use(cancelMiddleware({ timeout: { ms: 25, status: 504 } }));
    app.use(
      route(
        '/inherited',
        cancelableHandler(function* (ctx) {
          yield never();
          ctx.body = 'unreachable';
        }),
      ),
    );
    app.use(
      route(
        '/overridden',
        cancelableHandler(
          function* (ctx) {
            yield never();
            ctx.body = 'unreachable';
          },
          { timeout: { ms: 25, status: 507 } },
        ),
      ),
    );

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/inherited' })).status).toBe(504);
    expect((await httpRequest(port, { path: '/overridden' })).status).toBe(507);
  });
});

describe('middleware status option', () => {
  async function statusFor(options?: { status?: number }): Promise<number> {
    const app = new Koa();

    app.use(cancelMiddleware(options));
    app.use(
      cancelableHandler(function* () {
        yield CancelablePromise.resolve();

        throw Object.assign(new CancelError(SERVER_SHUTDOWN), { status: 503 });
      }),
    );

    const port = await listen(app);

    return (await httpRequest(port, { path: '/' })).status;
  }

  it('answers a cancellation with the configured status', async () => {
    expect(await statusFor({ status: 429 })).toBe(429);
  });

  it('throws a RangeError for a status koa does not answer with', () => {
    expect(() => cancelMiddleware({ status: 499 })).toThrow(RangeError);
  });

  it('keeps 503 when no status is configured', async () => {
    expect(await statusFor()).toBe(503);
  });
});

describe('request deadline timing', () => {
  useDeadlineClock();

  it('fires at the configured time on a plain route', async () => {
    const app = new Koa();
    const timeouts: CancelError[] = [];
    const reached = deferred();
    let signal!: AbortSignal;

    app.use(cancelMiddleware({ onTimeout: (reason) => timeouts.push(reason), timeout: 50 }));
    app.use(
      route('/plain', async (ctx) => {
        signal = getRequestSignal(ctx);
        reached.resolve();
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
        ctx.status = 504;
      }),
    );

    const port = await listen(app);
    const response = httpRequest(port, { path: '/plain' });
    await reached.promise;

    expectAbortAt(signal, 50);
    expect((await response).status).toBe(504);
    expect(timeouts).toHaveLength(1);
  });

  it('counts the time spent in middleware ahead of a wrapped handler', async () => {
    const app = new Koa();
    const upstream = deferred();
    const release = deferred();
    const reached = deferred();
    let signal!: AbortSignal;

    app.use(cancelMiddleware({ timeout: 100 }));
    app.use(async (_ctx, next) => {
      upstream.resolve();
      await release.promise;

      return next();
    });
    app.use(
      cancelableHandler(function* (ctx) {
        signal = getRequestSignal(ctx);
        reached.resolve();
        yield never();
        ctx.body = 'unreachable';
      }),
    );

    const port = await listen(app);
    const response = httpRequest(port, { path: '/slow' });
    await upstream.promise;

    jest.advanceTimersByTime(60);
    release.resolve();
    await reached.promise;

    expectAbortAt(signal, 40);
    expect((await response).status).toBe(503);
  });

  it('restarts from a timeout set by a wrapped layer further in', async () => {
    const app = new Koa();
    const reached = deferred();
    let signal!: AbortSignal;

    const inner = cancelableHandler(
      function* (ctx) {
        signal = getRequestSignal(ctx);
        reached.resolve();
        yield never();
        ctx.body = 'unreachable';
      },
      { timeout: 200 },
    );

    app.use(cancelMiddleware({ timeout: 50 }));
    app.use(
      route(
        '/slow',
        cancelableHandler(function* (ctx) {
          yield inner(ctx);
        }),
      ),
    );

    const port = await listen(app);
    const response = httpRequest(port, { path: '/slow' });
    await reached.promise;

    // past the middleware deadline, which the inner timeout replaced
    jest.advanceTimersByTime(100);
    expectAbortAt(signal, 100);
    expect((await response).status).toBe(503);
  });
});

describe('request deadline', () => {
  it('stops once the handler returned, while its body still streams', async () => {
    const app = new Koa();
    const timeouts: CancelError[] = [];
    let abortedAtEnd: boolean | undefined;

    app.use(cancelMiddleware({ onTimeout: (reason) => timeouts.push(reason), timeout: 50 }));
    app.use(
      route(
        '/stream',
        cancelableHandler(function* (ctx) {
          const signal = getRequestSignal(ctx);
          ctx.body = slowBody(() => {
            abortedAtEnd = signal.aborted;
          });
        }),
      ),
    );

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/stream' });

    expect(response).toEqual({ body: STREAMED_BODY, status: 200 });
    expect(abortedAtEnd).toBe(false);
    expect(timeouts).toEqual([]);
  });

  it('stops once a plain route returned, while its body still streams', async () => {
    const app = new Koa();
    const timeouts: CancelError[] = [];
    let abortedAtEnd: boolean | undefined;

    app.use(cancelMiddleware({ onTimeout: (reason) => timeouts.push(reason), timeout: 50 }));
    app.use(
      route('/plain', (ctx) => {
        const signal = getRequestSignal(ctx);
        ctx.body = slowBody(() => {
          abortedAtEnd = signal.aborted;
        });
      }),
    );

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/plain' });

    expect(response).toEqual({ body: STREAMED_BODY, status: 200 });
    expect(abortedAtEnd).toBe(false);
    expect(timeouts).toEqual([]);
  });

  it('reports a deadline once however many wrapped layers the request passed', async () => {
    const app = new Koa();
    const timeouts: CancelError[] = [];

    app.use(cancelMiddleware({ onTimeout: (reason) => timeouts.push(reason), timeout: 50 }));
    app.use(cancelMiddleware());
    app.use(
      route(
        '/slow',
        nest(
          2,
          cancelableHandler(function* (ctx) {
            yield never();
            ctx.body = 'unreachable';
          }),
        ),
      ),
    );

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/slow' })).status).toBe(503);
    await settleTurns();
    expect(timeouts).toHaveLength(1);
  });

  it('keeps the close listeners on the response bounded across twelve wrapped layers', async () => {
    const app = new Koa();
    const warnings = recordWarnings();
    let closeListeners = -1;
    let abortListeners = -1;

    // read at finish: every layer has registered whatever it registers by then, none removed yet
    app.use(async (ctx, next) => {
      // counts only what the wrapped chain adds: Node's own close listeners vary by version
      const before = ctx.res.listenerCount('close');
      ctx.res.on('finish', () => {
        closeListeners = ctx.res.listenerCount('close') - before;
      });
      await next();
    });
    app.use(
      route(
        '/deep',
        nest(
          11,
          cancelableHandler(function* (ctx) {
            abortListeners = getEventListeners(getRequestSignal(ctx), 'abort').length;
            ctx.body = 'ok';
          }),
        ),
      ),
    );

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/deep' })).body).toBe('ok');
    await settleTurns();
    // the disconnect wiring, plus the request registry of a server met for the first time
    expect(closeListeners).toBe(2);
    // read inside the route, the one in-flight forwarder however many layers
    expect(abortListeners).toBe(1);
    expect(warnings.stop()).toEqual([]);
  });
});

describe('request signal', () => {
  it('is one signal per request, shared with work started outside the route', async () => {
    const app = new Koa();
    const started = deferred();
    const aborted = deferred();
    let sameSignal = false;

    app.use(async (ctx, next) => {
      const signal = getRequestSignal(ctx);
      sameSignal = getRequestSignal(ctx) === signal && isCancelSignal(signal);
      signal.addEventListener('abort', () => aborted.resolve(), { once: true });
      await next();
    });
    app.use(
      route(
        '/hang',
        cancelableHandler(function* () {
          started.resolve();
          yield never();
        }),
      ),
    );

    const port = await listen(app);
    const client = await rawRequest(port, 'GET /hang HTTP/1.1\r\nHost: localhost\r\n\r\n');

    await started.promise;
    client.destroy();
    await aborted.promise;

    expect(sameSignal).toBe(true);
  });
});

describe('cancellation after the response ended', () => {
  it('is dropped instead of forwarded', async () => {
    const app = new Koa();
    const emitted: unknown[] = [];

    app.silent = true;
    app.on('error', (error: unknown) => emitted.push(error));
    app.use(
      route(
        '/late',
        cancelableHandler(function* (ctx) {
          // koa holds ctx.body until the whole chain returns, so the raw response is the only way
          // to finish answering before the cancellation lands
          ctx.respond = false;
          ctx.res.writeHead(200, { 'content-type': 'text/plain' });
          ctx.res.end('answered');
          yield CancelablePromise.resolve();

          throw new CancelError(SERVER_SHUTDOWN);
        }),
      ),
    );

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/late' });

    expect(response).toEqual({ body: 'answered', status: 200 });
    expect(emitted).toEqual([]);
  });
});

describe('cancel middleware error path', () => {
  it('passes anything that is not a cancellation through untouched', async () => {
    const app = new Koa();
    app.silent = true;
    const failure = new Error('boom');

    app.use(cancelMiddleware());
    app.use(() => {
      throw failure;
    });

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/' });

    // koa's own default handling answers 500 for anything cancelMiddleware rethrows
    expect(response.status).toBe(500);
  });

  it('leaves a cancellation carrying no status to koa', async () => {
    const app = new Koa();

    app.use(cancelMiddleware());
    app.use(() => {
      throw new CancelError(CLIENT_DISCONNECTED);
    });

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/' });

    expect(response.status).toBe(500);
  });

  it('answers a deadline with the status stamped on it', async () => {
    const app = new Koa();

    app.use(cancelMiddleware());
    app.use(() => {
      throw Object.assign(new CancelError(HANDLER_TIMEOUT), { status: 504 });
    });

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/' });

    expect(response.status).toBe(504);
  });

  it('reads the foreign statusCode spelling before the fallback', async () => {
    const app = new Koa();

    app.use(cancelMiddleware());
    app.use(() => {
      throw Object.assign(new CancelError(HANDLER_TIMEOUT), { statusCode: 504 });
    });

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/' });

    expect(response.status).toBe(504);
  });

  it('drops a cancellation whose client is already gone', async () => {
    const app = new Koa();
    const started = deferred();
    const handled = deferred();
    let headersSent: boolean | undefined;

    app.use(cancelMiddleware());
    // request scoped work outside cancelableHandler: the rejection reaches cancelMiddleware, which
    // is the only place left to drop it
    app.use(async (ctx) => {
      const signal = getRequestSignal(ctx);

      started.resolve();

      try {
        await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      } finally {
        headersSent = ctx.res.headersSent;
        handled.resolve();
      }
    });

    const port = await listen(app);
    const client = await rawRequest(port, 'GET /late HTTP/1.1\r\nHost: localhost\r\n\r\n');

    await started.promise;
    client.destroy();
    await handled.promise;

    expect(headersSent).toBe(false);
  });
});

describe('handler kinds', () => {
  it('answers 500 and emits a TypeError on the app for an async generator handler', async () => {
    const app = new Koa();
    const errors: unknown[] = [];

    app.on('error', (error: unknown) => errors.push(error));
    app.use(cancelMiddleware());
    app.use(cancelableHandler(asyncGeneratorHandler as never));

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/' })).status).toBe(500);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TypeError);
  });

  it('skips a handler whose caller signal was already aborted', async () => {
    const app = new Koa();
    const handler = jest.fn();

    app.use(cancelMiddleware());
    app.use(cancelableHandler(handler, { signal: AbortSignal.abort() }));

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/' })).status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('shutdown cancel status', () => {
  /** Reads the status line off the first bytes a raw connection gets back. */
  async function firstStatus(client: Socket): Promise<number> {
    const [chunk] = await once(client, 'data');

    return Number(/^HTTP\/1\.1 (\d{3})/.exec(String(chunk))?.[1]);
  }

  function hangingRoute(started: { resolve: () => void }) {
    return route(
      '/hang',
      cancelableHandler(function* (ctx) {
        started.resolve();
        yield never();
        ctx.body = 'unreachable';
      }),
    );
  }

  it('answers 503 for a shutdown cancel that reaches koa default error handling', async () => {
    const app = new Koa();
    const started = deferred();

    app.silent = true;
    app.use(hangingRoute(started));

    const port = await listen(app);
    const pending = httpRequest(port, { path: '/hang' });

    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 200 });

    expect((await pending).status).toBe(503);
  });

  it('takes the middleware status over the stamped 503 for a shutdown cancel', async () => {
    const app = new Koa();
    const started = deferred();

    app.use(cancelMiddleware({ status: 502 }));
    app.use(hangingRoute(started));

    const port = await listen(app);
    const pending = httpRequest(port, { path: '/hang' });

    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 200 });

    expect((await pending).status).toBe(502);
  });

  it('answers the shutdown status and headers without a middleware error handler', async () => {
    const app = new Koa();
    const started = deferred();

    app.silent = true;
    app.use(
      route(
        '/hang',
        cancelableHandler(function* (ctx) {
          started.resolve();
          yield never();
          ctx.body = 'unreachable';
        }),
      ),
    );

    const port = await listen(app);
    const pending = httpExchange(port, { path: '/hang' });

    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 200, headers: { 'Retry-After': '5' }, status: 504 });

    const answer = await pending;

    expect(answer.status).toBe(504);
    expect(answer.headers['retry-after']).toBe('5');
  });

  it('sends the shutdown headers through the cancel middleware', async () => {
    const app = new Koa();
    const started = deferred();

    app.silent = true;
    app.use(cancelMiddleware({ status: 502 }));
    app.use(
      route(
        '/hang',
        cancelableHandler(function* (ctx) {
          started.resolve();
          yield never();
          ctx.body = 'unreachable';
        }),
      ),
    );

    const port = await listen(app);
    const pending = httpExchange(port, { path: '/hang' });

    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 200, headers: { 'Retry-After': '5' }, status: 504 });

    const answer = await pending;

    expect(answer.status).toBe(504);
    expect(answer.headers['retry-after']).toBe('5');
  });

  it('keeps a deadline status over the middleware status', async () => {
    const app = new Koa();

    app.use(cancelMiddleware({ status: 502 }));
    app.use(
      route(
        '/slow',
        cancelableHandler(
          function* (ctx) {
            yield never();
            ctx.body = 'unreachable';
          },
          { timeout: { ms: 20, status: 504 } },
        ),
      ),
    );

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/slow' })).status).toBe(504);
  });

  it('gives each in-flight request its own shutdown cancellation', async () => {
    const app = new Koa();
    const reasons: unknown[] = [];
    let entered = 0;
    const bothStarted = deferred();

    app.use(cancelMiddleware());
    app.use(
      route(
        '/hang',
        cancelableHandler(function* (ctx) {
          const signal = getRequestSignal(ctx);
          signal.addEventListener('abort', () => reasons.push(signal.reason));
          entered += 1;
          if (entered === 2) {
            bothStarted.resolve();
          }
          yield never();
          ctx.body = 'unreachable';
        }),
      ),
    );

    const port = await listen(app);
    const pending = [httpRequest(port, { path: '/hang' }), httpRequest(port, { path: '/hang' })];

    await bothStarted.promise;
    await createShutdown(lastServer())({ cancelAfter: 200 });
    await Promise.all(pending);

    expect(reasons).toHaveLength(2);
    expect(reasons[0]).not.toBe(reasons[1]);
  });

  it('answers 503 for a request that arrives during a cancel-on-start drain with no middleware', async () => {
    const app = new Koa();

    app.silent = true;
    app.use(
      route(
        '/late',
        cancelableHandler(function* (ctx) {
          yield never();
          ctx.body = 'unreachable';
        }),
      ),
    );

    const port = await listen(app);
    // a connection opened before the drain starts is the only way to deliver a request while it runs
    const accepted = once(lastServer(), 'connection');
    const client = connect(port, '127.0.0.1');
    sockets.push(client);
    client.on('error', () => {});
    await accepted;

    const shutdown = createShutdown(lastServer())({ cancelAfter: 0, closeAfter: 500 });
    client.write('GET /late HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');

    expect(await firstStatus(client)).toBe(503);
    await shutdown;
  });

  it('lets a signal-only route answer 503 after the cancel, and counts it canceled', async () => {
    const app = new Koa();
    const reached = deferred();
    const events: string[] = [];

    app.silent = true;
    app.use(
      route(
        '/signal',
        (ctx) =>
          new Promise<void>((resolve) => {
            getRequestSignal(ctx).addEventListener('abort', () => {
              setTimeout(() => {
                events.push('answered');
                ctx.status = 503;
                resolve();
              }, 30);
            });
            reached.resolve();
          }),
      ),
    );

    const port = await listen(app);
    const pending = httpRequest(port, { path: '/signal' });
    await reached.promise;

    const shutdown = createShutdown(lastServer())({ cancelAfter: 50, closeAfter: 2_000 }).then((result) => {
      events.push('resolved');
      return result;
    });

    expect((await pending).status).toBe(503);
    expect(await shutdown).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect(events).toEqual(['answered', 'resolved']);
  });

  it('holds the window for a cleanup that awaits, then answers 503 and counts it canceled', async () => {
    const app = new Koa();
    const started = deferred();
    const events: string[] = [];

    app.silent = true;
    app.use(
      route(
        '/cleanup',
        cancelableHandler(function* (ctx) {
          started.resolve();
          try {
            yield never();
            ctx.body = 'unreachable';
          } finally {
            yield new CancelablePromise<void>((resolve) => setTimeout(resolve, 50));
            events.push('cleaned');
          }
        }),
      ),
    );

    const port = await listen(app);
    const pending = httpRequest(port, { path: '/cleanup' });
    await started.promise;

    const shutdown = createShutdown(lastServer())({ cancelAfter: 50, closeAfter: 2_000 }).then((result) => {
      events.push('resolved');
      return result;
    });

    expect((await pending).status).toBe(503);
    expect(await shutdown).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect(events).toEqual(['cleaned', 'resolved']);
  });
});

describe('shutdown', () => {
  it('cancels a live request when the grace window ends and reports the outcome', async () => {
    const app = new Koa();
    const started = deferred();

    app.use(cancelMiddleware());
    app.use(
      route(
        '/hang',
        cancelableHandler(function* (ctx) {
          started.resolve();
          yield never();
          ctx.body = 'unreachable';
        }),
      ),
    );

    const port = await listen(app);
    const pending = httpRequest(port, { path: '/hang' });

    await started.promise;
    const result = await createShutdown(lastServer())({ cancelAfter: 200 });

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect((await pending).status).toBe(503);
  });

  it('exits on a handler that ignores its cancellation', async () => {
    const app = new Koa();
    const started = deferred();

    app.use(
      route(
        '/shielded',
        cancelableHandler(
          function* () {
            started.resolve();
            yield never();
          },
          // a shielded handler ignores the cancellation a shutdown sends it, which is the
          // case the grace window exists for
          { shield: true },
        ),
      ),
    );

    const port = await listen(app);
    const client = await rawRequest(port, 'GET /shielded HTTP/1.1\r\nHost: localhost\r\n\r\n');

    await started.promise;
    const result = await createShutdown(lastServer())({ cancelAfter: 100 });
    client.destroy();

    expect(result.timedOut).toBe(true);
  });

  it('is idempotent while it is running', async () => {
    const app = new Koa();

    app.use(
      route(
        '/quick',
        cancelableHandler(function* (ctx) {
          ctx.body = 'ok';
        }),
      ),
    );

    await listen(app);
    const server = lastServer();
    const first = createShutdown(server)({ cancelAfter: 100 });

    expect(createShutdown(server)()).toBe(first);
    expect(await first).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });
});

const STREAMED_CHUNKS = 6;
const STREAMED_BODY = 'chunk\n'.repeat(STREAMED_CHUNKS);

/** A body koa streams over roughly 300ms after the handler returned, well past a 50ms deadline. */
function slowBody(onEnd: () => void): Readable {
  let written = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  return new Readable({
    destroy(error, callback) {
      clearInterval(timer);
      callback(error);
    },
    read() {
      if (timer) {
        return;
      }

      timer = setInterval(() => {
        written += 1;
        this.push('chunk\n');

        if (written === STREAMED_CHUNKS) {
          clearInterval(timer);
          onEnd();
          this.push(null);
        }
      }, 50);
    },
  });
}

/** Wraps a route in further wrapped layers, each one driving the next as its own handler task. */
function nest(depth: number, innermost: (ctx: Context) => Promise<void>): (ctx: Context) => Promise<void> {
  let layer = innermost;

  for (let level = 0; level < depth; level += 1) {
    const inner = layer;
    layer = cancelableHandler(function* (ctx) {
      yield inner(ctx);
    });
  }

  return layer;
}

/** Lets late rejections and emitted warnings land before an assertion reads them. */
async function settleTurns(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/**
 * Collects process warnings until stopped. Listens on the host process: the one jest hands a test
 * file is a copy, and node emits its warnings on the original.
 */
function recordWarnings(): { stop: () => string[] } {
  const host = runInThisContext('process') as NodeJS.Process;
  const seen: string[] = [];
  const listener = (warning: Error) => seen.push(`${warning.name}: ${warning.message}`);

  host.on('warning', listener);

  return {
    stop: () => {
      host.off('warning', listener);

      return seen;
    },
  };
}

/** An async generator handler, which the types reject and the runtime must refuse too. */
async function* asyncGeneratorHandler(): AsyncGenerator<number> {
  yield 1;
}

describeShutdownSockets(
  createShutdown,
  async (arrived, release) => {
    const plain = new Koa();
    plain.use(async (ctx) => {
      if (ctx.path === '/fast') {
        ctx.body = 'ok';
        return;
      }

      if (ctx.path === '/close' || ctx.path === '/flush') {
        ctx.set('Connection', 'close');
      }
      if (ctx.path === '/flush') {
        ctx.status = 200;
        ctx.flushHeaders();
      }

      arrived();
      await release;
      ctx.body = 'ok';
    });
    const server = await new Promise<Server>((resolve) => {
      const listening = plain.listen(0, '127.0.0.1', () => resolve(listening));
    });

    return { server, target: server };
  },
  { appSetHeaders: true },
);

describe('error response during the shutdown grace', () => {
  it('keeps Connection: close on a plain koa error, so the kept-alive socket is not reset', async () => {
    const arrived = deferred();
    const release = deferred();
    const app = new Koa();
    app.use(cancelMiddleware());
    app.use(async (ctx) => {
      if (ctx.path === '/boom') {
        arrived.resolve();
        await release.promise;
        throw new Error('boom');
      }
      ctx.body = 'ok';
    });
    const server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    servers.push(server);
    const port = (server.address() as { port: number }).port;

    const response = new Promise<IncomingMessage>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', path: '/boom', port }, resolve);
      req.on('error', reject);
      req.end();
    });
    await arrived.promise;

    const closing = createShutdown(server)({ cancelAfter: 200 });
    release.resolve();
    const answer = await response;
    answer.resume();

    expect(answer.statusCode).toBe(500);
    expect(answer.headers.connection).toBe('close');
    await closing;
  });
});

describe('cancellation through koa error handling', () => {
  it('answers a deadline before the head with koa text and headers, and emits error on the app', async () => {
    const app = new Koa();
    const emitted: unknown[] = [];
    app.on('error', (error) => emitted.push(error));
    app.use(cancelMiddleware());
    app.use(
      route(
        '/slow',
        cancelableHandler(
          function* (ctx) {
            ctx.body = { partial: true };
            yield never();
          },
          { timeout: { ms: 25, headers: { 'Retry-After': '5' } } },
        ),
      ),
    );

    const port = await listen(app);
    const response = await httpExchange(port, { path: '/slow' });
    await settleTurns();

    expect(response.status).toBe(503);
    expect(response.body).toBe('Service Unavailable');
    expect(response.headers['retry-after']).toBe('5');
    expect(emitted).toHaveLength(1);
    expect(isCancelError(emitted[0])).toBe(true);
  });

  it('cuts a deadline that fires after the head was sent, and still emits error on the app', async () => {
    const app = new Koa();
    const emitted: unknown[] = [];
    app.on('error', (error) => emitted.push(error));
    app.use(cancelMiddleware());
    app.use(
      route(
        '/stream',
        cancelableHandler(
          function* (ctx) {
            ctx.status = 200;
            ctx.flushHeaders();
            yield never();
          },
          { timeout: 25 },
        ),
      ),
    );

    const port = await listen(app);
    const answer = await new Promise<{ status?: number; complete: boolean }>((resolve) => {
      const req = request({ host: '127.0.0.1', path: '/stream', port }, (incoming) => {
        incoming.resume();
        incoming.on('close', () => resolve({ status: incoming.statusCode, complete: incoming.complete }));
      });
      req.on('error', () => undefined);
      req.end();
    });
    await settleTurns();

    expect(answer).toEqual({ status: 200, complete: false });
    expect(emitted).toHaveLength(1);
    expect(isCancelError(emitted[0])).toBe(true);
  });

  it('drops a disconnect: nothing is emitted on the app', async () => {
    const app = new Koa();
    const emitted: unknown[] = [];
    const arrived = deferred();
    app.on('error', (error) => emitted.push(error));
    app.use(cancelMiddleware());
    app.use(
      route(
        '/hang',
        cancelableHandler(function* () {
          arrived.resolve();
          yield never();
        }),
      ),
    );

    const port = await listen(app);
    const req = request({ host: '127.0.0.1', path: '/hang', port }, () => undefined);
    req.on('error', () => undefined);
    req.end();
    await arrived.promise;
    req.destroy();
    await settleTurns();

    expect(emitted).toEqual([]);
  });
});
