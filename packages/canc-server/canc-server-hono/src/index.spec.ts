import { getEventListeners, once } from 'node:events';
import http from 'node:http';
import { connect, Socket } from 'node:net';
import { runInThisContext } from 'node:vm';

import { CancelablePromise, CancelError, isCancelError, isCancelSignal } from '@cancjs/promise';
import { serve, ServerType } from '@hono/node-server';
import { Context, Hono, MiddlewareHandler, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { expectAbortAt, useDeadlineClock } from '../../../_server/__tests__/deadline-clock';
import { describeShutdownSockets } from '../../../_server/__tests__/shutdown-sockets';
import {
  cancelableHandler,
  cancelErrorHandler,
  cancelMiddleware,
  createShutdown,
  getRequestSignal,
  SERVER_SHUTDOWN,
  THonoHandler,
} from './index';

interface IDeferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface IClientResponse {
  body: string;
  statusCode: number | undefined;
}

function deferred<T = void>(): IDeferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

// drains the immediate queue instead of waiting a fixed time: the wrapper's handlers and the
// server's own write path run on later turns than the handler's finally
function tick(times = 3): Promise<void> {
  let chain = Promise.resolve();

  for (let index = 0; index < times; index += 1) {
    chain = chain.then(() => new Promise<void>((resolve) => setImmediate(resolve)));
  }

  return chain;
}

let server: ServerType | undefined;
const sockets: Socket[] = [];

function listen(app: Hono): Promise<number> {
  return new Promise((resolve) => {
    server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, (info) => resolve(info.port));
  });
}

function send(port: number, path: string, method = 'GET', body?: string): Promise<IClientResponse> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        headers: body ? { 'content-length': Buffer.byteLength(body), 'content-type': 'application/json' } : undefined,
        host: '127.0.0.1',
        method,
        path,
        port,
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve({ body: Buffer.concat(chunks).toString(), statusCode: response.statusCode }));
      },
    );

    request.on('error', reject);

    if (body !== undefined) {
      request.write(body);
    }

    request.end();
  });
}

// a destroyed request surfaces as ECONNRESET on the client side, which is the point of the test
function open(port: number, path: string): http.ClientRequest {
  const request = http.request({ host: '127.0.0.1', path, port });

  request.on('error', () => undefined);
  request.end();

  return request;
}

afterEach(async () => {
  const instance = server;

  server = undefined;

  if (instance) {
    await new Promise<void>((resolve) => {
      instance.close(() => resolve());
      (instance as http.Server).closeAllConnections();
    });
  }
});

describe('client disconnect on node', () => {
  it('unwinds the handler and leaves the dead socket alone', async () => {
    const started = deferred();
    const settled = deferred();
    let reason: unknown;
    let resumed = false;
    let headersSent: boolean | undefined;
    let reachedErrorHandler = 0;

    const app = new Hono();

    app.onError((error, c) => {
      reachedErrorHandler += 1;

      return c.text(String(error), 500);
    });
    app.use(cancelMiddleware());
    app.get(
      '/hang',
      cancelableHandler(
        function* (c) {
          try {
            expect(getRequestSignal(c).aborted).toBe(false);
            started.resolve();
            yield new Promise(() => undefined);
            resumed = true;

            return c.text('never');
          } finally {
            headersSent = (c.env as { outgoing: http.ServerResponse }).outgoing.headersSent;
            settled.resolve();
          }
        },
        {
          onDisconnect: (disconnected) => {
            reason = disconnected;
          },
        },
      ),
    );

    const port = await listen(app);
    const request = open(port, '/hang');

    await started.promise;
    request.destroy();
    await settled.promise;
    await tick();

    expect(isCancelError(reason)).toBe(true);
    expect((reason as CancelError).timedOut).toBe(false);
    expect(resumed).toBe(false);
    expect(headersSent).toBe(false);
    expect(reachedErrorHandler).toBe(0);
  });

  it('leaves a body carrying post alone', async () => {
    let abortedInHandler: boolean | undefined;

    const app = new Hono();

    app.use(cancelMiddleware());
    app.post(
      '/echo',
      cancelableHandler(function* (c) {
        const payload = (yield c.req.json()) as { name: string };

        abortedInHandler = getRequestSignal(c).aborted;

        return c.json({ got: payload.name });
      }),
    );

    const port = await listen(app);
    const response = await send(port, '/echo', 'POST', JSON.stringify({ name: 'kept' }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ got: 'kept' });
    expect(abortedInHandler).toBe(false);
  });

  it('keys the request state on the raw node request', async () => {
    let keyedOnIncoming = false;

    const app = new Hono();

    app.use(cancelMiddleware());
    app.get(
      '/keyed',
      cancelableHandler(function* (c) {
        // the contract every other consumer of this request relies on: request scoped work keyed on
        // the raw IncomingMessage, an ORM context or another package in this family, reaches the
        // very state this route is running under
        const incoming = (c.env as { incoming: Record<symbol, unknown> }).incoming;
        const state = incoming[Symbol.for('@cancjs/server-node:RequestCancelState')] as { signal: unknown } | undefined;

        keyedOnIncoming = !!state && state.signal === getRequestSignal(c);

        yield Promise.resolve();

        return c.text('keyed');
      }),
    );

    const port = await listen(app);
    const response = await send(port, '/keyed');

    expect(response.statusCode).toBe(200);
    expect(keyedOnIncoming).toBe(true);
  });

  it('hands every consumer of one request the same signal', async () => {
    let sameAsMiddleware = false;
    let cancelable = false;
    let outgoingListeners = 0;

    const app = new Hono();
    let fromMiddleware: unknown;

    app.use(cancelMiddleware({ timeout: 60_000 }));
    app.use(async (c, next) => {
      fromMiddleware = getRequestSignal(c);
      await next();
    });
    app.get(
      '/shared',
      cancelableHandler(function* (c) {
        const signal = getRequestSignal(c);

        sameAsMiddleware = signal === fromMiddleware && signal === getRequestSignal(c);
        cancelable = isCancelSignal(signal);
        outgoingListeners = (c.env as { outgoing: http.ServerResponse }).outgoing.listenerCount('close');

        yield Promise.resolve();

        return c.text('shared');
      }),
    );

    const port = await listen(app);
    const response = await send(port, '/shared');

    expect(response.statusCode).toBe(200);
    expect(sameAsMiddleware).toBe(true);
    expect(cancelable).toBe(true);
    // the disconnect wiring, the handler teardown and the server's request registry, no matter
    // how many consumers asked for the signal
    expect(outgoingListeners).toBeLessThanOrEqual(3);
  });
});

describe('deadline', () => {
  it('answers with the configured status while the client is still connected', async () => {
    let reported: CancelError | undefined;

    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.use(cancelMiddleware({ timeout: 60_000 }));
    app.get(
      '/slow',
      cancelableHandler(
        function* (c) {
          yield new Promise(() => undefined);

          return c.text('never');
        },
        {
          onTimeout: (reason) => {
            reported = reason;
          },
          timeout: { message: 'route took too long', ms: 20, status: 504 },
        },
      ),
    );

    const port = await listen(app);
    const response = await send(port, '/slow');

    expect(response.statusCode).toBe(504);
    expect(reported?.timedOut).toBe(true);
  });

  it('cuts the connection instead of completing a body whose head already went out', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.use(cancelMiddleware({ timeout: 60_000 }));
    app.get(
      '/raw',
      cancelableHandler(
        function* (c) {
          const outgoing = (c.env as { outgoing: http.ServerResponse }).outgoing;

          outgoing.writeHead(200, { 'content-type': 'text/plain' });
          outgoing.write('part1,');
          yield new Promise(() => undefined);

          return c.text('never');
        },
        { timeout: { message: 'route took too long', ms: 20, status: 504 } },
      ),
    );

    const port = await listen(app);
    const outcome = await new Promise<{ body: string; complete: boolean }>((resolve) => {
      const request = http.get({ host: '127.0.0.1', path: '/raw', port }, (response) => {
        let body = '';

        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => resolve({ body, complete: response.complete }));
        response.on('error', () => resolve({ body, complete: false }));
      });

      request.on('error', () => resolve({ body: '', complete: false }));
    });

    expect(outcome.complete).toBe(false);
    expect(outcome.body).not.toContain('Cannot write headers');
  });

  it('cuts the connection on a head-sent deadline with only the wrapper mounted', async () => {
    const app = new Hono();

    app.get(
      '/raw',
      cancelableHandler(
        function* (c) {
          const outgoing = (c.env as { outgoing: http.ServerResponse }).outgoing;

          outgoing.writeHead(200, { 'content-type': 'text/plain' });
          outgoing.write('part1,');
          yield new Promise(() => undefined);

          return c.text('never');
        },
        { timeout: { message: 'route took too long', ms: 20, status: 504 } },
      ),
    );

    const port = await listen(app);
    const outcome = await new Promise<{ body: string; complete: boolean }>((resolve) => {
      const request = http.get({ host: '127.0.0.1', path: '/raw', port }, (response) => {
        let body = '';

        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => resolve({ body, complete: response.complete }));
        response.on('error', () => resolve({ body, complete: false }));
      });

      request.on('error', () => resolve({ body: '', complete: false }));
    });

    expect(outcome.complete).toBe(false);
    expect(outcome.body).not.toContain('Cannot write headers');
  });

  it('reports the default status when the timeout names none', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.get(
      '/slow',
      cancelableHandler(
        function* (c) {
          yield new Promise(() => undefined);

          return c.text('never');
        },
        { timeout: 20 },
      ),
    );

    const port = await listen(app);
    const response = await send(port, '/slow');

    expect(response.statusCode).toBe(503);
  });
});

describe('error handler', () => {
  it('answers a route-signal cancel on a live connection with 503', async () => {
    const routeAbort = new AbortController();
    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.get(
      '/give-up',
      cancelableHandler(
        function* () {
          yield new Promise<void>(() => undefined);
          return new Response('late');
        },
        { signal: routeAbort.signal },
      ),
    );

    const port = await listen(app);
    const pending = send(port, '/give-up');

    setTimeout(() => routeAbort.abort(), 20);

    const response = await pending;

    expect(response.statusCode).toBe(503);
  });

  it('sends the configured fallback status', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler({ status: 500 }));
    app.get(
      '/give-up',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw Object.assign(new CancelError('gave up'), { status: 503 });
      }),
    );

    const port = await listen(app);
    const response = await send(port, '/give-up');

    expect(response.statusCode).toBe(500);
  });

  it('takes the status option for a route-signal cancel', async () => {
    const routeAbort = new AbortController();
    const app = new Hono();

    app.onError(cancelErrorHandler({ status: 507 }));
    app.get(
      '/carried',
      cancelableHandler(
        function* () {
          yield new Promise<void>(() => undefined);
          return new Response('late');
        },
        { signal: routeAbort.signal },
      ),
    );

    const port = await listen(app);
    const pending = send(port, '/carried');

    setTimeout(() => routeAbort.abort(), 20);

    const response = await pending;

    expect(response.statusCode).toBe(507);
  });

  it('drops a cancellation that surfaces after the client left', async () => {
    const started = deferred();
    const handled = deferred();
    let answered: number | undefined;
    let headersSent: boolean | undefined;

    const app = new Hono();
    const mapper = cancelErrorHandler();

    app.onError((error, c) => {
      const response = mapper(error, c) as Response;

      answered = response.status;
      headersSent = (c.env as { outgoing: http.ServerResponse }).outgoing.headersSent;
      handled.resolve();

      return response;
    });
    // request scoped work outside the wrapper: the rejection reaches the error handler, which is
    // the only place left to drop it
    app.get('/late', async (c) => {
      const signal = getRequestSignal(c);

      started.resolve();
      await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });

      return c.text('never');
    });

    const port = await listen(app);
    const request = open(port, '/late');

    await started.promise;
    request.destroy();
    await handled.promise;

    expect(answered).toBe(499);
    expect(headersSent).toBe(false);
  });

  it('answers with the response an ordinary failure carries', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.get(
      '/teapot',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw new HTTPException(418, { message: 'no coffee' });
      }),
    );

    const port = await listen(app);
    const response = await send(port, '/teapot');

    expect(response.statusCode).toBe(418);
    expect(response.body).toBe('no coffee');
  });

  it('answers 500 and logs an ordinary failure when no handler was supplied', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('boom');
    const app = new Hono();

    try {
      app.onError(cancelErrorHandler());
      app.get(
        '/boom',
        cancelableHandler(function* () {
          yield Promise.resolve();

          throw failure;
        }),
      );

      const port = await listen(app);
      const response = await send(port, '/boom');

      expect(response.statusCode).toBe(500);
      expect(response.body).toBe('Internal Server Error');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[@cancjs/server-hono]'), failure);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('passes an ordinary failure to the supplied handler', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler({ onError: (error, c) => c.text(error.message, 418) }));
    app.get(
      '/boom',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw new Error('boom');
      }),
    );

    const port = await listen(app);
    const response = await send(port, '/boom');

    expect(response.statusCode).toBe(418);
    expect(response.body).toBe('boom');
  });
});

describe('error handler gate and late failure', () => {
  it('answers 500 for an ordinary failure on a request with a live cancel state', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler({ status: 502 }));
    app.use(cancelMiddleware());
    app.get(
      '/boom',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw new Error('boom');
      }),
    );

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const port = await listen(app);
    const response = await send(port, '/boom');

    expect(response.statusCode).toBe(500);
    errorSpy.mockRestore();
  });

  it('leaves a user cancellation carrying its own status to the non-cancellation path', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler({ status: 502 }));
    app.use(cancelMiddleware());
    app.get(
      '/user-stop',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw Object.assign(new CancelError('user stop'), { status: 499 });
      }),
    );

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const port = await listen(app);
    const response = await send(port, '/user-stop');

    expect(response.statusCode).toBe(500);
    errorSpy.mockRestore();
  });

  it('reports a late failure of a signal-only handler to console.error once', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.get(
      '/late',
      cancelableHandler(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 80));

          throw new Error('late boom');
        },
        { timeout: 25 },
      ),
    );

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const port = await listen(app);
    const response = await send(port, '/late');

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(response.statusCode).toBe(503);
    expect(errorSpy.mock.calls.filter(([label]) => label === '[@cancjs/server-hono] late failure')).toHaveLength(1);
    errorSpy.mockRestore();
  });
});

describe('cancellation after the response ended', () => {
  it('is dropped instead of forwarded', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const forwarded: unknown[] = [];
    const app = new Hono();

    app.onError((error, c) => {
      forwarded.push(error);

      return cancelErrorHandler()(error, c);
    });
    // writing the adapter's own response is what a route streaming its answer does, and it is what
    // puts the finished response behind the cancellation
    app.get(
      '/late',
      cancelableHandler(function* (c) {
        const { outgoing } = c.env as { outgoing: http.ServerResponse };

        outgoing.writeHead(200, { 'content-type': 'text/plain' });
        outgoing.end('answered');
        yield Promise.resolve();

        throw new CancelError(SERVER_SHUTDOWN);
      }),
    );

    const port = await listen(app);
    const response = await send(port, '/late');
    await tick();

    expect(response).toEqual({ body: 'answered', statusCode: 200 });
    expect(forwarded).toEqual([]);
    // the 499 handed back must tell the node server the response is already out
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('handler kinds', () => {
  it('answers 500 through app.onError for an async generator handler', async () => {
    const errors: unknown[] = [];
    const app = new Hono();

    app.onError((error, c) => {
      errors.push(error);

      return c.text('failed', 500);
    });
    app.get('/', cancelableHandler(asyncGeneratorHandler as never));

    const port = await listen(app);
    const response = await send(port, '/');

    expect(response.statusCode).toBe(500);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TypeError);
  });

  it('skips a handler whose caller signal was already aborted', async () => {
    const handler = jest.fn();
    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.get('/', cancelableHandler(handler, { signal: AbortSignal.abort() }));

    const port = await listen(app);
    const response = await send(port, '/');

    expect(response.statusCode).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('shutdown cancel status', () => {
  it('leaves a plain handler error that lands during a shutdown uncounted as canceled', async () => {
    const app = new Hono();
    const started = deferred();
    const handle = cancelErrorHandler();

    // ahead of the cancel middleware: no cancel state exists until the error path reads it
    app.use(async () => {
      started.resolve();
      await new Promise((_resolve, reject) => setTimeout(() => reject(new CancelError('user')), 30));
    });
    app.use(cancelMiddleware());
    // answers after the shutdown canceled the request, so only a state read at once differs
    app.onError(async (error, c) => {
      await new Promise((resolve) => setTimeout(resolve, 150));

      return handle(error, c);
    });
    app.get('/plain', (c) => c.text('ok'));

    const port = await listen(app);
    const pending = send(port, '/plain');
    await started.promise;

    const result = await createShutdown(server!)({ cancelAfter: 60 });

    expect(result.canceled).toBe(0);
    expect((await pending).statusCode).toBe(500);
  });

  /** Reads the status line off the first bytes a raw connection gets back. */
  async function firstStatus(client: Socket): Promise<number> {
    const [chunk] = await once(client, 'data');

    return Number(/^HTTP\/1\.1 (\d{3})/.exec(String(chunk))?.[1]);
  }

  it('answers 500 for a shutdown cancel with no error handler, since hono default onError reads no status', async () => {
    const app = new Hono();
    const started = deferred();

    app.use(cancelMiddleware());
    app.get(
      '/hang',
      cancelableHandler(function* (c) {
        started.resolve();
        yield new Promise(() => undefined);

        return c.text('never');
      }),
    );

    const port = await listen(app);
    const pending = send(port, '/hang');
    await started.promise;
    await createShutdown(server!)({ cancelAfter: 200 });

    expect((await pending).statusCode).toBe(500);
  });

  it('takes the handler status over the stamped 503 for a shutdown cancel', async () => {
    const app = new Hono();
    const started = deferred();

    app.onError(cancelErrorHandler({ status: 502 }));
    app.use(cancelMiddleware());
    app.get(
      '/hang',
      cancelableHandler(function* (c) {
        started.resolve();
        yield new Promise(() => undefined);

        return c.text('never');
      }),
    );

    const port = await listen(app);
    const pending = send(port, '/hang');
    await started.promise;
    await createShutdown(server!)({ cancelAfter: 200 });

    expect((await pending).statusCode).toBe(502);
  });

  it('keeps an explicit shutdown status over the handler status', async () => {
    const app = new Hono();
    const started = deferred();

    app.onError(cancelErrorHandler({ status: 502 }));
    app.use(cancelMiddleware());
    app.get(
      '/hang',
      cancelableHandler(function* (c) {
        started.resolve();
        yield new Promise(() => undefined);

        return c.text('never');
      }),
    );

    const port = await listen(app);
    const pending = send(port, '/hang');
    await started.promise;
    await createShutdown(server!)({ cancelAfter: 200, status: 504 });

    expect((await pending).statusCode).toBe(504);
  });

  it('keeps a deadline status over the handler status', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler({ status: 502 }));
    app.use(cancelMiddleware());
    app.get(
      '/slow',
      cancelableHandler(
        function* (c) {
          yield new Promise(() => undefined);

          return c.text('never');
        },
        { timeout: { ms: 20, status: 504 } },
      ),
    );

    const port = await listen(app);

    expect((await send(port, '/slow')).statusCode).toBe(504);
  });

  it('gives each in-flight request its own shutdown cancellation', async () => {
    const errors: unknown[] = [];
    const handle = cancelErrorHandler();
    let entered = 0;
    const bothStarted = deferred();

    const app = new Hono();
    app.onError((error, c) => {
      errors.push(error);

      return handle(error, c);
    });
    app.use(cancelMiddleware());
    app.get(
      '/hang',
      cancelableHandler(function* (c) {
        entered += 1;
        if (entered === 2) {
          bothStarted.resolve();
        }
        yield new Promise(() => undefined);

        return c.text('never');
      }),
    );

    const port = await listen(app);
    const pending = [send(port, '/hang'), send(port, '/hang')];

    await bothStarted.promise;
    await createShutdown(server!)({ cancelAfter: 200 });
    await Promise.all(pending);

    expect(errors).toHaveLength(2);
    expect(errors[0]).not.toBe(errors[1]);
  });

  it('answers 500 for a request that arrives during a cancel-on-start drain with no error handler', async () => {
    const app = new Hono();

    app.use(cancelMiddleware());
    app.get(
      '/late',
      cancelableHandler(function* (c) {
        yield new Promise(() => undefined);

        return c.text('never');
      }),
    );

    const port = await listen(app);
    // a connection opened before the drain starts is the only way to deliver a request while it runs
    const accepted = once(server!, 'connection');
    const client = connect(port, '127.0.0.1');
    sockets.push(client);
    client.on('error', () => {});
    await accepted;

    const shutdown = createShutdown(server!)({ cancelAfter: 0, closeAfter: 500 });
    client.write('GET /late HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');

    expect(await firstStatus(client)).toBe(500);
    await shutdown;
  });

  it('lets a signal-only route answer 503 after the cancel, and counts it canceled', async () => {
    const app = new Hono();
    const reached = deferred();
    const events: string[] = [];

    app.use(cancelMiddleware());
    app.get(
      '/signal',
      (c) =>
        new Promise<Response>((resolve) => {
          getRequestSignal(c).addEventListener('abort', () => {
            setTimeout(() => {
              events.push('answered');
              resolve(c.body(null, 503));
            }, 30);
          });
          reached.resolve();
        }),
    );

    const port = await listen(app);
    const pending = send(port, '/signal');
    await reached.promise;

    const shutdown = createShutdown(server!)({ cancelAfter: 50, closeAfter: 2_000 }).then((result) => {
      events.push('resolved');
      return result;
    });

    expect((await pending).statusCode).toBe(503);
    expect(await shutdown).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect(events).toEqual(['answered', 'resolved']);
  });

  it('holds the window for a cleanup that awaits, then answers 500 and counts it canceled', async () => {
    const app = new Hono();
    const started = deferred();
    const events: string[] = [];

    app.use(cancelMiddleware());
    app.get(
      '/cleanup',
      cancelableHandler(function* (c) {
        started.resolve();
        try {
          yield new Promise(() => undefined);

          return c.text('never');
        } finally {
          yield new CancelablePromise<void>((resolve) => setTimeout(resolve, 50));
          events.push('cleaned');
        }
      }),
    );

    const port = await listen(app);
    const pending = send(port, '/cleanup');
    await started.promise;

    const shutdown = createShutdown(server!)({ cancelAfter: 50, closeAfter: 2_000 }).then((result) => {
      events.push('resolved');
      return result;
    });

    expect((await pending).statusCode).toBe(500);
    expect(await shutdown).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect(events).toEqual(['cleaned', 'resolved']);
  });
});

describe('shutdown', () => {
  it('cancels a hung handler when the grace window ends', async () => {
    const started = deferred();

    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.use(cancelMiddleware());
    app.get(
      '/hang',
      cancelableHandler(function* (c) {
        started.resolve();
        yield new Promise(() => undefined);

        return c.text('never');
      }),
    );

    const port = await listen(app);
    const instance = server!;

    const pending = send(port, '/hang');
    await started.promise;

    const result = await createShutdown(instance)({ cancelAfter: 200 });

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect((await pending).statusCode).toBe(503);
    expect((instance as http.Server).listening).toBe(false);
  });

  it('returns the same result to a second call', async () => {
    const app = new Hono();

    app.get(
      '/ok',
      cancelableHandler(function* (c) {
        yield Promise.resolve();

        return c.text('ok');
      }),
    );

    await listen(app);

    const instance = server!;
    const first = createShutdown(instance)({ cancelAfter: 1000 });
    const second = createShutdown(instance)({ cancelAfter: 1000 });

    expect(await first).toEqual(await second);
  });
});

describe('request deadline timing', () => {
  useDeadlineClock();

  it('fires at the configured time on a plain route', async () => {
    const timeouts: CancelError[] = [];
    const reached = deferred();
    let signal!: AbortSignal;

    const app = new Hono();

    app.use(cancelMiddleware({ onTimeout: (reason) => timeouts.push(reason), timeout: 50 }));
    app.get('/plain', async (c) => {
      signal = getRequestSignal(c);
      reached.resolve();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));

      return c.text('aborted', 504);
    });

    const port = await listen(app);
    const response = send(port, '/plain');
    await reached.promise;

    expectAbortAt(signal, 50);
    expect((await response).statusCode).toBe(504);
    expect(timeouts).toHaveLength(1);
  });

  it('fires at the configured time on a web standard runtime too', async () => {
    const reached = deferred();
    let signal!: AbortSignal;

    const app = new Hono();

    app.use(cancelMiddleware({ timeout: 50 }));
    app.get('/plain', async (c) => {
      signal = getRequestSignal(c);
      reached.resolve();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));

      return c.text('aborted', 504);
    });

    const response = app.fetch(new Request('http://canc.test/plain'));
    await reached.promise;

    expectAbortAt(signal, 50);
    expect((await response).status).toBe(504);
  });

  it('counts the time spent in middleware ahead of a wrapped handler', async () => {
    const upstream = deferred();
    const release = deferred();
    const reached = deferred();
    let signal!: AbortSignal;

    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.use(cancelMiddleware({ timeout: 100 }));
    app.use(async (_c, next) => {
      upstream.resolve();
      await release.promise;
      await next();
    });
    app.get(
      '/slow',
      cancelableHandler(function* (c) {
        signal = getRequestSignal(c);
        reached.resolve();
        yield new Promise(() => undefined);

        return c.text('never');
      }),
    );

    const port = await listen(app);
    const response = send(port, '/slow');
    await upstream.promise;

    jest.advanceTimersByTime(60);
    release.resolve();
    await reached.promise;

    expectAbortAt(signal, 40);
    expect((await response).statusCode).toBe(503);
  });

  it('restarts from a route timeout behind a wrapped middleware', async () => {
    const reached = deferred();
    let signal!: AbortSignal;

    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.use(cancelMiddleware({ timeout: 50 }));
    app.use(passThrough());
    app.get(
      '/slow',
      cancelableHandler(
        function* (c) {
          signal = getRequestSignal(c);
          reached.resolve();
          yield new Promise(() => undefined);

          return c.text('never');
        },
        { timeout: 200 },
      ),
    );

    const port = await listen(app);
    const response = send(port, '/slow');
    await reached.promise;

    // past the middleware deadline, which the route timeout replaced
    jest.advanceTimersByTime(100);
    expectAbortAt(signal, 100);
    expect((await response).statusCode).toBe(503);
  });
});

describe('request deadline', () => {
  it('stops once the handler returned, while its body still streams', async () => {
    const timeouts: CancelError[] = [];
    let abortedAtEnd: boolean | undefined;

    const app = new Hono();

    app.get(
      '/stream',
      cancelableHandler(
        function* (c) {
          const signal = getRequestSignal(c);

          return c.body(
            slowBody(() => {
              abortedAtEnd = signal.aborted;
            }),
          );
        },
        { onTimeout: (reason) => timeouts.push(reason), timeout: 50 },
      ),
    );

    const port = await listen(app);
    const response = await send(port, '/stream');

    expect(response).toEqual({ body: STREAMED_BODY, statusCode: 200 });
    expect(abortedAtEnd).toBe(false);
    expect(timeouts).toEqual([]);
  });

  it('stops once a plain route returned, while its body still streams', async () => {
    const timeouts: CancelError[] = [];
    let abortedAtEnd: boolean | undefined;

    const app = new Hono();

    app.use(cancelMiddleware({ onTimeout: (reason) => timeouts.push(reason), timeout: 50 }));
    app.get('/plain', (c) => {
      const signal = getRequestSignal(c);

      return c.body(
        slowBody(() => {
          abortedAtEnd = signal.aborted;
        }),
      );
    });

    const port = await listen(app);
    const response = await send(port, '/plain');

    expect(response).toEqual({ body: STREAMED_BODY, statusCode: 200 });
    expect(abortedAtEnd).toBe(false);
    expect(timeouts).toEqual([]);
  });

  it('reports a deadline once however many wrapped layers the request passed', async () => {
    const timeouts: CancelError[] = [];

    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.use(cancelMiddleware({ onTimeout: (reason) => timeouts.push(reason), timeout: 50 }));
    app.use(passThrough());
    app.use(passThrough());
    app.get(
      '/slow',
      cancelableHandler(function* (c) {
        yield new Promise(() => undefined);

        return c.text('never');
      }),
    );

    const port = await listen(app);

    expect((await send(port, '/slow')).statusCode).toBe(503);
    await tick(5);
    expect(timeouts).toHaveLength(1);
  });

  it('keeps the close listeners on the response bounded across twelve wrapped layers', async () => {
    const warnings = recordWarnings();
    let closeListeners = -1;
    let abortListeners = -1;

    const app = new Hono();

    // read at finish: every layer has registered whatever it registers by then, none removed yet
    app.use(async (c, next) => {
      const outgoing = (c.env as { outgoing: http.ServerResponse }).outgoing;
      // counts only what the wrapped chain adds: Node's own close listeners vary by version
      const before = outgoing.listenerCount('close');

      outgoing.on('finish', () => {
        closeListeners = outgoing.listenerCount('close') - before;
      });
      await next();
    });

    for (let layer = 0; layer < 11; layer += 1) {
      app.use(passThrough());
    }

    app.get(
      '/deep',
      cancelableHandler(function* (c) {
        abortListeners = getEventListeners(getRequestSignal(c), 'abort').length;

        return c.text('ok');
      }),
    );

    const port = await listen(app);

    expect((await send(port, '/deep')).body).toBe('ok');
    await tick(5);
    // the disconnect wiring, plus the request registry of a server met for the first time
    expect(closeListeners).toBe(2);
    // read inside the route, the one in-flight forwarder however many layers
    expect(abortListeners).toBe(1);
    expect(warnings.stop()).toEqual([]);
  });
});

describe('web standard runtime', () => {
  it('cancels the handler when the request is aborted', async () => {
    const started = deferred();
    const settled = deferred();
    let resumed = false;
    let reason: unknown;

    const app = new Hono();

    app.get(
      '/hang',
      cancelableHandler(
        function* (c) {
          try {
            started.resolve();
            yield new Promise(() => undefined);
            resumed = true;

            return c.text('never');
          } finally {
            settled.resolve();
          }
        },
        {
          onDisconnect: (disconnected) => {
            reason = disconnected;
          },
        },
      ),
    );

    const controller = new AbortController();
    const pending = app.fetch(new Request('http://canc.test/hang', { signal: controller.signal }));

    await started.promise;
    controller.abort();
    await settled.promise;

    const response = await pending;

    expect(response.status).toBe(499);
    expect(resumed).toBe(false);
    expect(isCancelError(reason)).toBe(true);
  });

  it('applies the deadline without a node response to hang it off', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.get(
      '/slow',
      cancelableHandler(
        function* (c) {
          yield new Promise(() => undefined);

          return c.text('never');
        },
        { timeout: { ms: 20, status: 504 } },
      ),
    );

    const response = await app.fetch(new Request('http://canc.test/slow'));

    expect(response.status).toBe(504);
  });

  it('shares one signal across consumers of the same request', async () => {
    let shared = false;

    const app = new Hono();

    app.use(cancelMiddleware());
    app.get(
      '/shared',
      cancelableHandler(function* (c) {
        shared = getRequestSignal(c) === getRequestSignal(c);

        yield Promise.resolve();

        return c.text('shared');
      }),
    );

    const response = await app.fetch(new Request('http://canc.test/shared'));

    expect(response.status).toBe(200);
    expect(shared).toBe(true);
  });
});

const STREAMED_CHUNKS = 6;
const STREAMED_BODY = 'chunk\n'.repeat(STREAMED_CHUNKS);

/** A body streamed over roughly 300ms after the handler returned, well past a 50ms deadline. */
function slowBody(onEnd: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  return new ReadableStream<Uint8Array>({
    cancel() {
      clearInterval(timer);
    },
    start(controller) {
      let written = 0;

      timer = setInterval(() => {
        written += 1;
        controller.enqueue(encoder.encode('chunk\n'));

        if (written === STREAMED_CHUNKS) {
          clearInterval(timer);
          onEnd();
          controller.close();
        }
      }, 50);
    },
  });
}

/** A wrapped middleware that hands the request straight on, the shape of an auth or tenant layer. */
function passThrough(): MiddlewareHandler {
  return cancelableHandler(function* (_c: Context, next: Next) {
    yield next();
  } as unknown as THonoHandler) as unknown as MiddlewareHandler;
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

describeShutdownSockets(createShutdown, async (arrived, release) => {
  const plain = new Hono();
  plain.get('/fast', (c) => c.text('ok'));
  plain.get('/slow', async (c) => {
    arrived();
    await release;

    return c.text('ok');
  });
  const server = await new Promise<http.Server>((resolve) => {
    const listening = serve({ fetch: plain.fetch, hostname: '127.0.0.1', port: 0 }, () =>
      resolve(listening as http.Server),
    );
  });

  return { server, target: server };
});
