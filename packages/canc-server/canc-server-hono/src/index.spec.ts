import http from 'node:http';

import { CancelError, isCancelError, isCancelSignal } from '@cancjs/promise';
import { serve, ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import {
  cancelableHandler,
  cancelErrorHandler,
  cancelMiddleware,
  drain,
  getRequestSignal,
  SERVER_SHUTDOWN,
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
    // one from the disconnect wiring and one from the handler teardown, no matter how many
    // consumers asked for the signal
    expect(outgoingListeners).toBeLessThanOrEqual(2);
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
  it('answers a cancellation raised on a live connection', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.get(
      '/give-up',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw new CancelError('gave up');
      }),
    );

    const port = await listen(app);
    const response = await send(port, '/give-up');

    expect(response.statusCode).toBe(503);
  });

  it('sends the configured fallback status', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler({ status: 500 }));
    app.get(
      '/give-up',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw new CancelError('gave up');
      }),
    );

    const port = await listen(app);
    const response = await send(port, '/give-up');

    expect(response.statusCode).toBe(500);
  });

  it('reads a status the cancellation carries as a status code', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.get(
      '/carried',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw Object.assign(new CancelError('gave up'), { statusCode: 507 });
      }),
    );

    const port = await listen(app);
    const response = await send(port, '/carried');

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

  it('rethrows an ordinary failure when no handler was supplied', async () => {
    const app = new Hono();

    app.onError(cancelErrorHandler());
    app.get(
      '/boom',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw new Error('boom');
      }),
    );

    const port = await listen(app);
    const response = await send(port, '/boom');

    expect(response.statusCode).toBe(500);
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

describe('cancellation after the response ended', () => {
  it('is dropped instead of forwarded', async () => {
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
  });
});

describe('drain', () => {
  it('cancels a hung handler instead of waiting for it', async () => {
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

    // the drain kills the connection on its way out, so this one is never read back
    send(port, '/hang').catch(() => undefined);
    await started.promise;

    const result = await drain(instance, { timeout: 5000 });

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
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
    const first = drain(instance, { timeout: 1000 });
    const second = drain(instance, { timeout: 1000 });

    expect(await first).toEqual(await second);
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
