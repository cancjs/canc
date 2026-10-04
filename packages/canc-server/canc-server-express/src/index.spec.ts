import { CancelablePromise, CancelError, isCancelError, isCancelSignal } from '@cancjs/promise';
import { once } from 'events';
import express, { ErrorRequestHandler, Express, Request, Response } from 'express';
import { IncomingMessage, request, Server } from 'http';
import { connect, Socket } from 'net';

import {
  cancelableHandler,
  cancelErrorHandler,
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

describe('client disconnect', () => {
  it('unwinds the handler and answers nothing', async () => {
    const app = express();
    const started = deferred();
    const finished = deferred();
    const disconnects: CancelError[] = [];
    const forwarded: unknown[] = [];
    let written: { finish: boolean; headersSent: boolean; writableEnded: boolean } | undefined;

    app.get(
      '/hang',
      cancelableHandler(
        function* (_req, res) {
          let finish = false;
          res.on('finish', () => {
            finish = true;
          });

          started.resolve();

          try {
            yield never();
            res.send('unreachable');
          } finally {
            written = { finish, headersSent: res.headersSent, writableEnded: res.writableEnded };
            finished.resolve();
          }
        },
        {
          onDisconnect: (reason) => disconnects.push(reason),
        },
      ),
    );
    app.use(recordErrors(forwarded));

    const port = await listen(app);
    const client = await rawRequest(port, 'GET /hang HTTP/1.1\r\nHost: localhost\r\n\r\n');

    await started.promise;
    client.destroy();
    await finished.promise;

    expect(written).toEqual({ finish: false, headersSent: false, writableEnded: false });
    expect(disconnects).toHaveLength(1);
    expect(isCancelError(disconnects[0])).toBe(true);
    expect(disconnects[0].timedOut).toBe(false);
    expect(forwarded).toEqual([]);
  });

  it('never starts a handler whose client left before it was reached', async () => {
    const app = express();
    const reported = deferred();
    let invoked = 0;

    // the route is held until the connection is provably gone, so the pre-flight guard is what the
    // assertion measures rather than the race between a destroy and the next tick of the server
    app.use((_req, res, next) => {
      res.once('close', () => next());
    });
    app.get(
      '/late',
      cancelableHandler(
        function* () {
          invoked += 1;
        },
        { onDisconnect: () => reported.resolve() },
      ),
    );

    const port = await listen(app);
    const client = await rawRequest(port, 'GET /late HTTP/1.1\r\nHost: localhost\r\n\r\n');
    client.destroy();
    await reported.promise;

    expect(invoked).toBe(0);
  });
});

describe('request with a body', () => {
  it('completes a POST behind a body parser instead of canceling it', async () => {
    const app = express();
    const disconnects: CancelError[] = [];

    app.use(express.json());
    app.post(
      '/echo',
      cancelableHandler(
        function* (req, res) {
          // a real suspension point: a signal wired from the request stream aborts before this
          // resumes, so a regression stops the handler right here instead of answering
          yield CancelablePromise.resolve();
          res.json({ echoed: (req.body as { value: string }).value });
        },
        {
          onDisconnect: (reason) => disconnects.push(reason),
        },
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
    const app = express();
    const timeouts: CancelError[] = [];

    app.get(
      '/slow',
      cancelableHandler(
        function* (_req, res) {
          yield never();
          res.send('unreachable');
        },
        {
          onTimeout: (reason) => timeouts.push(reason),
          timeout: { ms: 25, status: 504 },
        },
      ),
    );
    app.use(cancelErrorHandler());

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/slow' });

    expect(response.status).toBe(504);
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].timedOut).toBe(true);
  });

  it('falls back to the default status for the millisecond shorthand', async () => {
    const app = express();

    app.get(
      '/slow',
      cancelableHandler(
        function* (_req, res) {
          yield never();
          res.send('unreachable');
        },
        { timeout: 25 },
      ),
    );
    app.use(cancelErrorHandler());

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/slow' })).status).toBe(503);
  });
});

describe('middleware options', () => {
  it('are inherited by every route and overridden per route', async () => {
    const app = express();

    app.use(cancelMiddleware({ timeout: { ms: 25, status: 504 } }));
    app.get(
      '/inherited',
      cancelableHandler(function* (_req, res) {
        yield never();
        res.send('unreachable');
      }),
    );
    app.get(
      '/overridden',
      cancelableHandler(
        function* (_req, res) {
          yield never();
          res.send('unreachable');
        },
        { timeout: { ms: 25, status: 507 } },
      ),
    );
    app.use(cancelErrorHandler());

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/inherited' })).status).toBe(504);
    expect((await httpRequest(port, { path: '/overridden' })).status).toBe(507);
  });
});

describe('request signal', () => {
  it('is one signal per request, shared with work started outside the route', async () => {
    const app = express();
    const started = deferred();
    const aborted = deferred();
    let sameSignal = false;

    app.get('/hang', (req, res, next) => {
      const signal = getRequestSignal(req, res);
      sameSignal = getRequestSignal(req, res) === signal && isCancelSignal(signal);
      signal.addEventListener('abort', () => aborted.resolve(), { once: true });
      next();
    });
    app.get(
      '/hang',
      cancelableHandler(function* () {
        started.resolve();
        yield never();
      }),
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
    const app = express();
    const forwarded: unknown[] = [];

    app.get(
      '/late',
      cancelableHandler(function* (_req, res) {
        res.send('answered');
        yield CancelablePromise.resolve();

        throw new CancelError(SERVER_SHUTDOWN);
      }),
    );
    app.use(recordErrors(forwarded));

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/late' });

    expect(response).toEqual({ body: 'answered', status: 200 });
    expect(forwarded).toEqual([]);
  });
});

describe('cancel error handler', () => {
  it('passes anything that is not a cancellation through untouched', () => {
    const failure = new Error('boom');
    const forwarded: unknown[] = [];
    const { res } = fakeResponse();

    cancelErrorHandler()(failure, fakeRequest(), res, (error?: unknown) => forwarded.push(error));

    expect(forwarded).toEqual([failure]);
  });

  it('drops a cancellation whose client is already gone', () => {
    const forwarded: unknown[] = [];
    const { calls, res } = fakeResponse({ destroyed: true });

    cancelErrorHandler()(new CancelError(SERVER_SHUTDOWN), fakeRequest(), res, (error?: unknown) =>
      forwarded.push(error),
    );

    expect(calls).toEqual({ ended: 0, status: undefined });
    expect(forwarded).toEqual([]);
  });

  it('stops writing a response whose head already went out', () => {
    const { calls, res } = fakeResponse({ headersSent: true });

    cancelErrorHandler()(new CancelError(SERVER_SHUTDOWN), fakeRequest(), res, fail);

    expect(calls).toEqual({ ended: 1, status: undefined });
  });

  it('answers a cancellation carrying no status with the configured fallback', () => {
    const { calls, res } = fakeResponse();

    cancelErrorHandler({ status: 499 })(new CancelError(CLIENT_DISCONNECTED), fakeRequest(), res, fail);

    expect(calls).toEqual({ ended: 1, status: 499 });
  });

  it('answers a deadline with the status stamped on it', () => {
    const deadline = Object.assign(new CancelError(HANDLER_TIMEOUT), { status: 504 });
    const { calls, res } = fakeResponse();

    cancelErrorHandler()(deadline, fakeRequest(), res, fail);

    expect(calls).toEqual({ ended: 1, status: 504 });
  });

  it('reads the express spelling of the status before the fallback', () => {
    const foreign = Object.assign(new CancelError(HANDLER_TIMEOUT), { statusCode: 504 });
    const { calls, res } = fakeResponse();

    cancelErrorHandler()(foreign, fakeRequest(), res, fail);

    expect(calls).toEqual({ ended: 1, status: 504 });
  });
});

describe('shutdown', () => {
  it('cancels a live request and reports the outcome', async () => {
    const app = express();
    const started = deferred();
    const forwarded: unknown[] = [];

    app.get(
      '/hang',
      cancelableHandler(function* (_req, res) {
        started.resolve();
        yield never();
        res.send('unreachable');
      }),
    );
    app.use(recordErrors(forwarded));

    const port = await listen(app);
    const pending = httpRequest(port, { path: '/hang' });

    await started.promise;
    const result = await shutdown(lastServer(), { timeout: 1000 });

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect((await pending).status).toBe(503);
    expect(forwarded).toHaveLength(1);
    expect(isCancelError(forwarded[0])).toBe(true);
  });

  it('exits on a handler that ignores its cancellation', async () => {
    const app = express();
    const started = deferred();

    app.get(
      '/shielded',
      cancelableHandler(
        function* () {
          started.resolve();
          yield never();
        },
        // a shielded handler ignores the cancellation a shutdown sends it, which is the case the grace
        // window exists for
        { shield: true },
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
    const app = express();

    app.get(
      '/quick',
      cancelableHandler(function* (_req, res) {
        res.send('ok');
      }),
    );

    await listen(app);
    const server = lastServer();
    const first = shutdown(server, { timeout: 100 });

    expect(shutdown(server)).toBe(first);
    expect(await first).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });
});

interface IResponseCalls {
  ended: number;
  status?: number;
}

/** The three response members the error handler reads, plus a record of what it wrote. */
function fakeResponse(state: { destroyed?: boolean; headersSent?: boolean; writableEnded?: boolean } = {}): {
  calls: IResponseCalls;
  res: Response;
} {
  const calls: IResponseCalls = { ended: 0, status: undefined };
  const res = {
    destroyed: false,
    end: () => {
      calls.ended += 1;

      return res;
    },
    headersSent: false,
    status: (code: number) => {
      calls.status = code;

      return res;
    },
    writableEnded: false,
    ...state,
  };

  return { calls, res: res as unknown as Response };
}

function fakeRequest(): Request {
  return {} as Request;
}

/** Fails the test if the error handler forwards where it should have answered. */
function fail(error?: unknown): void {
  throw new Error(`expected the error handler to answer, it forwarded ${String(error)}`);
}

/** An error handler that records what the wrapper forwarded, then answers so the client is not left hanging. */
function recordErrors(sink: unknown[]): ErrorRequestHandler {
  return (error, _req, res, _next) => {
    sink.push(error);
    res.status(503).end();
  };
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
async function listen(app: Express): Promise<number> {
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
