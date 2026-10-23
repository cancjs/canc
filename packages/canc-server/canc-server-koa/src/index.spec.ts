import { CancelablePromise, CancelError, isCancelError, isCancelSignal } from '@cancjs/promise';
import { getEventListeners, once } from 'events';
import { IncomingMessage, request, Server } from 'http';
import Koa, { Context, Middleware, Next } from 'koa';
import { connect, Socket } from 'net';
import { Readable } from 'stream';
import { runInThisContext } from 'vm';

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
  return new Promise((resolve, reject) => {
    const outgoing = request(
      { headers: options.headers, host: '127.0.0.1', method: options.method ?? 'GET', path: options.path, port },
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
    expect(response.body).toBe('');
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

        throw new CancelError(SERVER_SHUTDOWN);
      }),
    );

    const port = await listen(app);

    return (await httpRequest(port, { path: '/' })).status;
  }

  it('answers a cancellation with the configured status', async () => {
    expect(await statusFor({ status: 499 })).toBe(499);
  });

  it('keeps 503 when no status is configured', async () => {
    expect(await statusFor()).toBe(503);
  });
});

describe('request deadline', () => {
  it('covers a plain route from the moment the middleware is installed', async () => {
    const app = new Koa();
    const timeouts: CancelError[] = [];

    app.use(cancelMiddleware({ onTimeout: (reason) => timeouts.push(reason), timeout: 50 }));
    app.use(
      route('/plain', async (ctx) => {
        ctx.body = await untilAborted(getRequestSignal(ctx));
      }),
    );

    const port = await listen(app);
    const outcome = JSON.parse((await httpRequest(port, { path: '/plain' })).body) as IAbortOutcome;

    expect(outcome.aborted).toBe(true);
    expect(outcome.ms).toBeLessThan(ABORT_FALLBACK_MS);
    expect(timeouts).toHaveLength(1);
  });

  it('restarts from a timeout set by a wrapped layer further in', async () => {
    const app = new Koa();
    let started = 0;

    const inner = cancelableHandler(
      function* (ctx) {
        started = performance.now();
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
    const response = await httpRequest(port, { path: '/slow' });

    expect(response.status).toBe(503);
    expect(performance.now() - started).toBeGreaterThanOrEqual(190);
  });

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

  it('answers a cancellation carrying no status with the configured fallback', async () => {
    const app = new Koa();

    app.use(cancelMiddleware());
    app.use(() => {
      throw new CancelError(CLIENT_DISCONNECTED);
    });

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/' });

    expect(response.status).toBe(503);
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
    const result = await createShutdown(lastServer())({ timeout: 200 });

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: true });
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
    const result = await createShutdown(lastServer())({ timeout: 100 });
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
    const first = createShutdown(server)({ timeout: 100 });

    expect(createShutdown(server)()).toBe(first);
    expect(await first).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });
});

/** How long a plain route waits for its signal before answering that it never aborted. */
const ABORT_FALLBACK_MS = 1000;

interface IAbortOutcome {
  aborted: boolean;
  ms: number;
}

/** Waits for a signal to abort, or gives up after the fallback window, and reports which and when. */
function untilAborted(signal: AbortSignal): Promise<IAbortOutcome> {
  const started = performance.now();

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(fallback);
      resolve({ aborted: signal.aborted, ms: performance.now() - started });
    };
    const fallback = setTimeout(finish, ABORT_FALLBACK_MS);

    signal.addEventListener('abort', finish, { once: true });
  });
}

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
