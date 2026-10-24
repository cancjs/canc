import { CancelablePromise, CancelError, isCancelError, isCancelSignal, TimeoutError } from '@cancjs/promise';
import { getEventListeners, once } from 'events';
import express, { ErrorRequestHandler, Express, Request, Response } from 'express';
import { IncomingHttpHeaders, IncomingMessage, request, Server } from 'http';
import { connect, Socket } from 'net';
import { runInThisContext } from 'vm';

import { expectAbortAt, useDeadlineClock } from '../../../_server/__tests__/deadline-clock';
import { describeShutdownSockets } from '../../../_server/__tests__/shutdown-sockets';
import { toRequestLike, toResponseLike } from '../../../_server/exchange';
import { ensureRequestCancelState } from '../../../_server/node-signal';
import {
  cancelableHandler,
  cancelErrorHandler,
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
        { onDisconnect: (reason) => disconnects.push(reason) },
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
        { onDisconnect: (reason) => disconnects.push(reason) },
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
        { onTimeout: (reason) => timeouts.push(reason), timeout: { ms: 25, status: 504 } },
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

describe('request deadline timing', () => {
  useDeadlineClock();

  it('fires at the configured time on a plain route', async () => {
    const app = express();
    const timeouts: CancelError[] = [];
    const reached = deferred();
    let signal!: AbortSignal;

    app.use(cancelMiddleware({ onTimeout: (reason) => timeouts.push(reason), timeout: 50 }));
    app.get('/plain', (req, res) => {
      signal = getRequestSignal(req, res);
      signal.addEventListener('abort', () => res.status(504).end());
      reached.resolve();
    });

    const port = await listen(app);
    const response = httpRequest(port, { path: '/plain' });
    await reached.promise;

    expectAbortAt(signal, 50);
    expect((await response).status).toBe(504);
    expect(timeouts).toHaveLength(1);
  });

  it('counts the time spent in middleware ahead of a wrapped handler', async () => {
    const app = express();
    const upstream = deferred();
    const release = deferred();
    const reached = deferred();
    let signal!: AbortSignal;

    app.use(cancelMiddleware({ timeout: 100 }));
    app.use((_req, _res, next) => {
      upstream.resolve();
      void release.promise.then(() => next());
    });
    app.get(
      '/slow',
      cancelableHandler(function* (req, res) {
        signal = getRequestSignal(req, res);
        reached.resolve();
        yield never();
        res.send('unreachable');
      }),
    );
    app.use(cancelErrorHandler());

    const port = await listen(app);
    const response = httpRequest(port, { path: '/slow' });
    await upstream.promise;

    jest.advanceTimersByTime(60);
    release.resolve();
    await reached.promise;

    expectAbortAt(signal, 40);
    expect((await response).status).toBe(503);
  });

  it('restarts from a route timeout behind a wrapped middleware', async () => {
    const app = express();
    const reached = deferred();
    let signal!: AbortSignal;

    app.use(cancelMiddleware({ timeout: 50 }));
    app.use(passThrough());
    app.get(
      '/slow',
      cancelableHandler(
        function* (req, res) {
          signal = getRequestSignal(req, res);
          reached.resolve();
          yield never();
          res.send('unreachable');
        },
        { timeout: 200 },
      ),
    );
    app.use(cancelErrorHandler());

    const port = await listen(app);
    const response = httpRequest(port, { path: '/slow' });
    await reached.promise;

    // past the middleware deadline, which the route timeout replaced
    jest.advanceTimersByTime(100);
    expectAbortAt(signal, 100);
    expect((await response).status).toBe(503);
  });
});

describe('request deadline', () => {
  it('stops once the handler returned, while its body still streams', async () => {
    const app = express();
    const timeouts: CancelError[] = [];
    let abortedAtEnd: boolean | undefined;

    app.get(
      '/stream',
      cancelableHandler(
        function* (req, res) {
          const signal = getRequestSignal(req, res);
          streamBody(res, () => {
            abortedAtEnd = signal.aborted;
          });
        },
        { onTimeout: (reason) => timeouts.push(reason), timeout: 50 },
      ),
    );

    const port = await listen(app);
    const response = await streamedRequest(port, '/stream');

    expect(response).toMatchObject({ body: STREAMED_BODY, complete: true, failed: false, status: 200 });
    expect(abortedAtEnd).toBe(false);
    expect(timeouts).toEqual([]);
  });

  it('reports a deadline once however many wrapped layers the request passed', async () => {
    const app = express();
    const timeouts: CancelError[] = [];

    app.use(cancelMiddleware({ onTimeout: (reason) => timeouts.push(reason), timeout: 50 }));
    app.use(passThrough());
    app.use(passThrough());
    app.get(
      '/slow',
      cancelableHandler(function* (_req, res) {
        yield never();
        res.send('unreachable');
      }),
    );
    app.use(cancelErrorHandler());

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/slow' })).status).toBe(503);
    await settleTurns();
    expect(timeouts).toHaveLength(1);
  });

  it('keeps the close listeners on the response bounded across twelve wrapped layers', async () => {
    const app = express();
    const warnings = recordWarnings();
    let closeListeners = -1;
    let abortListeners = -1;

    // read at finish: every layer has registered whatever it registers by then, none removed yet
    app.use((req, res, next) => {
      // counts only what the wrapped chain adds: Node's own close listeners vary by version
      const before = res.listenerCount('close');
      res.on('finish', () => {
        closeListeners = res.listenerCount('close') - before;
      });
      next();
    });

    for (let layer = 0; layer < 11; layer += 1) {
      app.use(passThrough());
    }

    app.get(
      '/deep',
      cancelableHandler(function* (req, res) {
        abortListeners = getEventListeners(getRequestSignal(req, res), 'abort').length;
        res.send('ok');
      }),
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

  it('forwards a deadline to next once when a middleware is still running', async () => {
    const app = express();
    const handled: unknown[] = [];
    const fellThrough: unknown[] = [];
    const answer = cancelErrorHandler();

    app.use(cancelMiddleware({ timeout: 50 }));
    app.use(
      cancelableHandler(function* (_req, _res, next) {
        next();
        yield never();
      }),
    );
    app.get(
      '/slow',
      cancelableHandler(function* (_req, res) {
        yield never();
        res.send('unreachable');
      }),
    );
    app.use(((error, req, res, next) => {
      handled.push(error);
      answer(error, req, res, next);
    }) as ErrorRequestHandler);
    app.use(((error, _req, _res, next) => {
      fellThrough.push(error);
      next(error);
    }) as ErrorRequestHandler);

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/slow' })).status).toBe(503);
    await settleTurns();
    expect(handled).toHaveLength(1);
    expect(fellThrough).toEqual([]);
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
    const shutdown = Object.assign(new CancelError(SERVER_SHUTDOWN), { status: 503 });

    cancelErrorHandler()(shutdown, ownedRequest(SERVER_SHUTDOWN), res, (error?: unknown) => forwarded.push(error));

    expect(calls).toEqual({ ended: 0, status: undefined });
    expect(forwarded).toEqual([]);
  });

  it('forwards a cancellation the request does not own to express', () => {
    const userCancel = new CancelError(CLIENT_DISCONNECTED);
    const forwarded: unknown[] = [];
    const { calls, res } = fakeResponse();

    cancelErrorHandler({ status: 499 })(userCancel, fakeRequest(), res, (error?: unknown) => forwarded.push(error));

    expect(calls).toEqual({ ended: 0, status: undefined });
    expect(forwarded).toEqual([userCancel]);
  });

  it('forwards a stamped cancellation the request never canceled, whatever status it carries', () => {
    const stamped = Object.assign(new CancelError(HANDLER_TIMEOUT), { status: 504 });
    const forwarded: unknown[] = [];
    const { calls, res } = fakeResponse();

    cancelErrorHandler()(stamped, fakeRequest(), res, (error?: unknown) => forwarded.push(error));

    expect(calls).toEqual({ ended: 0, status: undefined });
    expect(forwarded).toEqual([stamped]);
  });

  it('answers a deadline with the status stamped on it', () => {
    const deadline = Object.assign(new CancelError(HANDLER_TIMEOUT), { status: 504 });
    const { calls, res } = fakeResponse();

    cancelErrorHandler()(deadline, ownedRequest(HANDLER_TIMEOUT), res, fail);

    expect(calls).toEqual({ ended: 1, status: 504 });
  });

  it('reads the express spelling of the status before the fallback', () => {
    const foreign = Object.assign(new CancelError(HANDLER_TIMEOUT), { statusCode: 504 });
    const { calls, res } = fakeResponse();

    cancelErrorHandler()(foreign, ownedRequest(HANDLER_TIMEOUT), res, fail);

    expect(calls).toEqual({ ended: 1, status: 504 });
  });
});

describe('framework headers on a cancel answer', () => {
  it('answers a deadline clean: no stale content headers, the timeout headers applied', async () => {
    const app = express();

    app.get(
      '/slow',
      cancelableHandler(
        function* (_req, res) {
          res.type('json');
          res.set('Content-Encoding', 'gzip');
          yield never();
          res.send('unreachable');
        },
        { timeout: { ms: 25, headers: { 'Retry-After': '5' } } },
      ),
    );
    app.use(cancelErrorHandler());

    const port = await listen(app);
    const response = await httpExchange(port, { path: '/slow' });

    expect(response.status).toBe(503);
    expect(response.headers['retry-after']).toBe('5');
    expect(response.headers['content-type']).toBeUndefined();
    expect(response.headers['content-encoding']).toBeUndefined();
  });

  it('lets express answer a user cancellation through its own handling', async () => {
    const app = express();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    app.set('env', 'development');
    app.get(
      '/cancel',
      cancelableHandler(() => {
        throw new CancelError(CLIENT_DISCONNECTED);
      }),
    );
    app.use(cancelErrorHandler());

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/cancel' });

    // finalhandler reports the error on the next check phase, after the response is read
    await new Promise((resolve) => setImmediate(resolve));

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('CancelError'));

    consoleError.mockRestore();
  });

  it('leaves a plain route error that lands during a shutdown uncounted as canceled', async () => {
    const app = express();
    const arrived = deferred();

    app.get('/plain', (_req, _res, next) => {
      arrived.resolve();
      setTimeout(() => next(new Error('boom')), 30);
    });
    app.use(cancelErrorHandler());
    app.use(((_err, _req, res, _next) => {
      setTimeout(() => res.status(500).end('late'), 150);
    }) as ErrorRequestHandler);

    const port = await listen(app);
    const response = httpRequest(port, { path: '/plain' });

    await arrived.promise;

    expect((await createShutdown(lastServer())({ cancelAfter: 60 })).canceled).toBe(0);
    expect((await response).body).toBe('late');
  });

  it('answers a derived cancel of a plain route with the request deadline status and headers', async () => {
    const app = express();

    app.use(cancelMiddleware({ timeout: { ms: 60, status: 504, headers: { 'Retry-After': '5' } } }));
    app.get('/derived', (req, res, next) => {
      const child = never();

      getRequestSignal(req, res).addEventListener('abort', () => {
        child.cancel();
      });
      void child.then(() => res.send('late'), next);
    });
    app.use(cancelErrorHandler());

    const port = await listen(app);
    const response = await httpExchange(port, { path: '/derived' });

    expect(response.status).toBe(504);
    expect(response.headers['retry-after']).toBe('5');
  });

  it('keeps the connection reusable after a real late res.json past a deadline answer', async () => {
    const app = express();

    let lateWriteRan = false;

    app.use(cancelMiddleware({ timeout: { ms: 60, status: 504 } }));
    app.get(
      '/derived',
      cancelableHandler((_req: Request, res: Response) => {
        // a timer outside the canceled chain, so the write after the deadline answer really runs
        setTimeout(() => {
          lateWriteRan = true;

          try {
            res.json({ late: true });
          } catch {
            // the deadline answer already ended the response, so this write throws by design
          }
        }, 150);

        return new CancelablePromise<void>(() => undefined);
      }),
    );
    app.get('/ok', (_req, res) => {
      res.send('ok');
    });
    app.use(cancelErrorHandler());

    const port = await listen(app);
    const socket = connect({ host: '127.0.0.1', port });

    await once(socket, 'connect');

    const first = await socketExchange(socket, '/derived');

    await new Promise((resolve) => setTimeout(resolve, 200));

    const second = await socketExchange(socket, '/ok');

    socket.destroy();

    expect(first.status).toBe(504);
    expect(lateWriteRan).toBe(true);
    expect(second.status).toBe(200);
    expect(second.body).toBe('ok');
  });

  it('answers a user cancellation carrying status 499 with its own status, not the option', async () => {
    const app = express();

    app.get(
      '/user',
      cancelableHandler(() => {
        throw Object.assign(new CancelError('user'), { status: 499 });
      }),
    );
    app.use(cancelErrorHandler({ status: 502 }));

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/user' });

    expect(response.status).toBe(499);
  });

  it('leaves the headers of a shutdown with no status of its own off an option-status answer', async () => {
    const app = express();
    const started = deferred();

    app.get(
      '/hold',
      cancelableHandler(function* () {
        started.resolve();
        yield never();
      }),
    );
    app.use(cancelErrorHandler({ status: 418 }));

    const port = await listen(app);
    const pending = httpExchange(port, { path: '/hold' });

    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 0, headers: { 'Retry-After': '5' } });
    const response = await pending;

    expect(response.status).toBe(418);
    expect(response.headers['retry-after']).toBeUndefined();
  });

  it('logs a late failure once outside the test environment', async () => {
    const app = express();
    app.set('env', 'development');
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    app.get(
      '/late',
      cancelableHandler(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          throw new Error('late');
        },
        { timeout: 20 },
      ),
    );
    app.use(cancelErrorHandler());

    const port = await listen(app);
    const response = await httpRequest(port, { path: '/late' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(response.status).toBe(503);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0][0])).toContain('late');
    logged.mockRestore();
  });
});

describe('cancellation after the head was sent', () => {
  it('cuts a chunked body short instead of ending it cleanly', async () => {
    const app = express();

    app.get(
      '/export',
      cancelableHandler(
        function* (_req, res) {
          res.write('[{"row":1},');
          yield never();
          res.end('{"row":2}]');
        },
        { timeout: 25 },
      ),
    );
    app.use(cancelErrorHandler());

    const port = await listen(app);
    const response = await streamedRequest(port, '/export');

    expect(response.status).toBe(200);
    expect(response.body).toBe('[{"row":1},');
    expect(response.complete).toBe(false);
    expect(response.failed).toBe(true);
  });

  it('cuts a chunked body short when the server shuts down', async () => {
    const app = express();
    const started = deferred();

    app.get(
      '/export',
      cancelableHandler(function* (_req, res) {
        res.write('[{"row":1},');
        started.resolve();
        yield never();
        res.end('{"row":2}]');
      }),
    );
    app.use(cancelErrorHandler());

    const port = await listen(app);
    const pending = streamedRequest(port, '/export');
    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 200 });

    const response = await pending;

    expect(response.complete).toBe(false);
    expect(response.failed).toBe(true);
  });
});

describe('handler kinds', () => {
  it('answers 500 through the error middleware for an async generator handler', async () => {
    const app = express();
    const errors: unknown[] = [];

    app.get('/', cancelableHandler(asyncGeneratorHandler as never));
    app.use(((error, _req, res, _next) => {
      errors.push(error);
      res.status(500).end();
    }) as ErrorRequestHandler);

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/' })).status).toBe(500);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TypeError);
  });

  it('skips a handler whose caller signal was already aborted', async () => {
    const app = express();
    const handler = jest.fn();

    app.get('/', cancelableHandler(handler, { signal: AbortSignal.abort() }));
    app.use(cancelErrorHandler());

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

  it('answers 503 for a shutdown cancel with no error handler', async () => {
    const app = express();
    const started = deferred();

    app.get(
      '/hang',
      cancelableHandler(function* (_req, res) {
        started.resolve();
        yield never();
        res.send('unreachable');
      }),
    );

    const port = await listen(app);
    const pending = httpRequest(port, { path: '/hang' });

    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 200 });

    expect((await pending).status).toBe(503);
  });

  it('takes the handler status over the stamped 503 for a shutdown cancel', async () => {
    const app = express();
    const started = deferred();

    app.get(
      '/hang',
      cancelableHandler(function* (_req, res) {
        started.resolve();
        yield never();
        res.send('unreachable');
      }),
    );
    app.use(cancelErrorHandler({ status: 502 }));

    const port = await listen(app);
    const pending = httpRequest(port, { path: '/hang' });

    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 200 });

    expect((await pending).status).toBe(502);
  });

  it('answers the shutdown status and headers without a handler error handler', async () => {
    const app = express();
    const started = deferred();

    app.get(
      '/hang',
      cancelableHandler(function* (_req, res) {
        started.resolve();
        yield never();
        res.send('unreachable');
      }),
    );

    const port = await listen(app);
    const pending = httpExchange(port, { path: '/hang' });

    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 200, headers: { 'Retry-After': '5' }, status: 504 });

    const answer = await pending;

    expect(answer.status).toBe(504);
    expect(answer.headers['retry-after']).toBe('5');
  });

  it('sends the shutdown headers through the cancel error handler', async () => {
    const app = express();
    const started = deferred();

    app.get(
      '/hang',
      cancelableHandler(function* (_req, res) {
        started.resolve();
        yield never();
        res.send('unreachable');
      }),
    );
    app.use(cancelErrorHandler({ status: 502 }));

    const port = await listen(app);
    const pending = httpExchange(port, { path: '/hang' });

    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 200, headers: { 'Retry-After': '5' }, status: 504 });

    const answer = await pending;

    expect(answer.status).toBe(504);
    expect(answer.headers['retry-after']).toBe('5');
  });

  it('leaves a user timeout that carries no status to express', async () => {
    const app = express();

    app.get(
      '/user-timeout',
      cancelableHandler(function* () {
        throw new CancelError('user timeout', { cause: new TimeoutError('user timeout') });
      }),
    );
    app.use(cancelErrorHandler({ status: 502 }));

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/user-timeout' })).status).toBe(500);
  });

  it('keeps a deadline status over the handler status', async () => {
    const app = express();

    app.get(
      '/slow',
      cancelableHandler(
        function* (_req, res) {
          yield never();
          res.send('unreachable');
        },
        { timeout: { ms: 20, status: 504 } },
      ),
    );
    app.use(cancelErrorHandler({ status: 502 }));

    const port = await listen(app);

    expect((await httpRequest(port, { path: '/slow' })).status).toBe(504);
  });

  it('gives each in-flight request its own shutdown cancellation', async () => {
    const app = express();
    const forwarded: unknown[] = [];
    let entered = 0;
    const bothStarted = deferred();

    app.get(
      '/hang',
      cancelableHandler(function* (_req, res) {
        entered += 1;
        if (entered === 2) {
          bothStarted.resolve();
        }
        yield never();
        res.send('unreachable');
      }),
    );
    app.use(recordErrors(forwarded));

    const port = await listen(app);
    const pending = [httpRequest(port, { path: '/hang' }), httpRequest(port, { path: '/hang' })];

    await bothStarted.promise;
    await createShutdown(lastServer())({ cancelAfter: 200 });
    await Promise.all(pending);

    expect(forwarded).toHaveLength(2);
    expect(forwarded[0]).not.toBe(forwarded[1]);
  });

  it('answers 503 for a request that arrives during a cancel-on-start drain', async () => {
    const app = express();

    app.get(
      '/late',
      cancelableHandler(function* (_req, res) {
        yield never();
        res.send('unreachable');
      }),
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
    const app = express();
    const reached = deferred();
    const events: string[] = [];

    app.get('/signal', (req, res) => {
      getRequestSignal(req, res).addEventListener('abort', () => {
        setTimeout(() => {
          events.push('answered');
          res.status(503).end();
        }, 30);
      });
      reached.resolve();
    });

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
    const app = express();
    const started = deferred();
    const events: string[] = [];

    app.get(
      '/cleanup',
      cancelableHandler(function* (_req, res) {
        started.resolve();
        try {
          yield never();
          res.send('unreachable');
        } finally {
          yield new CancelablePromise<void>((resolve) => setTimeout(resolve, 50));
          events.push('cleaned');
        }
      }),
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
    const result = await createShutdown(lastServer())({ cancelAfter: 200 });

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect((await pending).status).toBe(503);
    expect(forwarded).toHaveLength(1);
    expect(isCancelError(forwarded[0])).toBe(true);
  });

  it('counts a request once behind wrapped middleware', async () => {
    const app = express();
    const started = deferred();

    app.use(cancelableHandler((_req, _res, next) => next()));
    app.use(
      cancelableHandler(function* (_req, _res, next) {
        next();
      }),
    );
    app.get(
      '/hang',
      cancelableHandler(function* (_req, res) {
        started.resolve();
        yield never();
        res.send('unreachable');
      }),
    );
    app.use(cancelErrorHandler());

    const port = await listen(app);
    const pending = httpRequest(port, { path: '/hang' });

    await started.promise;
    const result = await createShutdown(lastServer())({ cancelAfter: 200 });

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect((await pending).status).toBe(503);
  });

  it('lets a plain route finish behind wrapped middleware', async () => {
    const app = express();
    const started = deferred();

    app.use(cancelableHandler((_req, _res, next) => next()));
    app.get('/plain', (_req, res) => {
      started.resolve();
      setTimeout(() => res.send('plain ok'), 200);
    });

    const port = await listen(app);
    const pending = httpRequest(port, { path: '/plain' });

    await started.promise;
    // one macrotask, so the middleware task that already called next() has settled
    await new Promise((resolve) => setImmediate(resolve));
    const result = await createShutdown(lastServer())({ cancelAfter: 1000 });

    expect(await pending).toEqual({ body: 'plain ok', status: 200 });
    expect(result).toEqual({ canceled: 0, completed: 1, timedOut: false });
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
    const result = await createShutdown(lastServer())({ cancelAfter: 100 });
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
    const first = createShutdown(server)({ cancelAfter: 100 });

    expect(createShutdown(server)()).toBe(first);
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
    once: () => res,
    removeHeader: () => undefined,
    set: () => res,
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

/** A request whose state is canceled with `reason`, the way a deadline or a shutdown cancels it. */
function ownedRequest(reason: unknown): Request {
  const req = fakeRequest();
  const { res } = fakeResponse();

  ensureRequestCancelState(toRequestLike(req), toResponseLike(res)).cancel(reason);

  return req;
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

interface IStreamedResponse {
  status: number;
  body: string;
  complete: boolean;
  failed: boolean;
}

/** Reads a response to its close and reports whether the message arrived whole or was cut short. */
function streamedRequest(port: number, path: string): Promise<IStreamedResponse> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', method: 'GET', path, port }, (incoming: IncomingMessage) => {
      const chunks: Buffer[] = [];
      let failed = false;

      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('error', () => {
        failed = true;
      });
      incoming.on('close', () =>
        resolve({
          body: Buffer.concat(chunks).toString('utf8'),
          complete: incoming.complete,
          failed,
          status: incoming.statusCode ?? 0,
        }),
      );
    });

    outgoing.on('error', reject);
    outgoing.end();
  });
}

interface IHttpOptions {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * One request written onto an open socket, resolved once its body is complete by `Content-Length`.
 * Both requests of a reuse test go out on one socket this way, so the reuse does not depend on the
 * global keep-alive setting, which node 18 leaves off.
 */
function socketExchange(socket: Socket, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    let buffered = '';

    const onData = (chunk: Buffer): void => {
      buffered += chunk.toString('utf8');

      const head = buffered.indexOf('\r\n\r\n');

      if (head === -1) {
        return;
      }

      const length = /content-length: (\d+)/i.exec(buffered.slice(0, head));
      const size = length ? Number(length[1]) : 0;

      if (buffered.length - (head + 4) < size) {
        return;
      }

      socket.off('data', onData);
      socket.off('error', reject);
      resolve({
        body: buffered.slice(head + 4, head + 4 + size),
        status: Number(/^HTTP\/1\.1 (\d{3})/.exec(buffered)?.[1]),
      });
    };

    socket.on('data', onData);
    socket.once('error', reject);
    socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`);
  });
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

const STREAMED_CHUNKS = 6;
const STREAMED_BODY = 'chunk\n'.repeat(STREAMED_CHUNKS);

/** Writes a chunked body over roughly 300ms, well past a 50ms deadline, then ends it. */
function streamBody(res: Response, onEnd: () => void): void {
  let written = 0;

  res.writeHead(200, { 'content-type': 'text/plain' });

  const timer = setInterval(() => {
    res.write('chunk\n');
    written += 1;

    if (written === STREAMED_CHUNKS) {
      clearInterval(timer);
      onEnd();
      res.end();
    }
  }, 50);
}

/** A wrapped middleware that hands the request straight on, the shape of an auth or tenant layer. */
function passThrough() {
  return cancelableHandler(function* (_req, _res, next) {
    next();
  });
}

/** Lets late rejections, error forwarding and emitted warnings land before an assertion reads them. */
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

describe('an app keep-alive set during the shutdown', () => {
  it('is overridden, so the answer still closes its connection', async () => {
    const app = express();
    const arrived = deferred();
    const release = deferred();

    app.get('/late', (_req, res) => {
      arrived.resolve();
      void release.promise.then(() => {
        res.set('Connection', 'keep-alive');
        res.send('ok');
      });
    });

    const port = await listen(app);
    const shutdown = createShutdown(lastServer());
    const client = connect(port, '127.0.0.1');
    sockets.push(client);
    client.setEncoding('utf8');
    client.on('error', () => undefined);
    let received = '';
    client.on('data', (chunk: string) => {
      received += chunk;
    });
    const closed = once(client, 'close');
    client.write('GET /late HTTP/1.1\r\nHost: localhost\r\n\r\n');

    await arrived.promise;
    const closing = shutdown({ cancelAfter: 200 });
    release.resolve();
    await closed;

    expect(await closing).toEqual({ canceled: 0, completed: 1, timedOut: false });
    expect(received).toMatch(/^connection: close/im);
    expect(received).not.toMatch(/keep-alive/i);
  });
});

describeShutdownSockets(
  createShutdown,
  async (arrived, release) => {
    const plain = express();
    plain.get('/fast', (_req, res) => {
      res.send('ok');
    });
    plain.get('/slow', (_req, res) => {
      arrived();
      void release.then(() => res.send('ok'));
    });
    plain.get('/close', (_req, res) => {
      res.set('Connection', 'close');
      arrived();
      void release.then(() => res.send('ok'));
    });
    plain.get('/flush', (_req, res) => {
      res.set('Connection', 'close');
      res.flushHeaders();
      arrived();
      void release.then(() => res.end('ok'));
    });
    const server = await new Promise<Server>((resolve) => {
      const listening = plain.listen(0, '127.0.0.1', () => resolve(listening));
    });

    return { server, target: server };
  },
  { appSetHeaders: true },
);
