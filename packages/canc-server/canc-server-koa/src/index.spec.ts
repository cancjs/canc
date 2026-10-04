import { CancelablePromise, CancelError, isCancelError, isCancelSignal } from '@cancjs/promise';
import { once } from 'events';
import { IncomingMessage, request, Server } from 'http';
import Koa, { Context, Middleware, Next } from 'koa';
import { connect, Socket } from 'net';

import {
  cancelableHandler,
  cancelMiddleware,
  CLIENT_DISCONNECTED,
  getRequestSignal,
  HANDLER_TIMEOUT,
  SERVER_SHUTDOWN,
  shutdown,
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
      {
        headers: options.headers,
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
          {
            onTimeout: (reason) => timeouts.push(reason),
            timeout: { ms: 25, status: 504 },
          },
        ),
      ),
    );

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/slow' });

    expect(response.status).toBe(504);
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].timedOut).toBe(true);
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

describe('shutdown', () => {
  it('cancels a live request and reports the outcome', async () => {
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
    const result = await shutdown(lastServer(), { timeout: 1000 });

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
    const result = await shutdown(lastServer(), { timeout: 100 });
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
    const first = shutdown(server, { timeout: 100 });

    expect(shutdown(server)).toBe(first);
    expect(await first).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });
});
