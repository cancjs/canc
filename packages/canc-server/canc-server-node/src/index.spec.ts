import { CancelablePromise, CancelError, isCancelError, isCancelSignal } from '@cancjs/promise';
import { getEventListeners, once } from 'events';
import { createServer, IncomingHttpHeaders, IncomingMessage, request, Server, ServerResponse } from 'http';
import { connect, Socket } from 'net';
import { runInThisContext } from 'vm';

import { expectAbortAt, useDeadlineClock } from '../../../_server/__tests__/deadline-clock';
import { describeShutdownSockets } from '../../../_server/__tests__/shutdown-sockets';
import { toRequestLike, toResponseLike } from '../../../_server/exchange';
import { ensureRequestCancelState } from '../../../_server/node-signal';
import {
  cancelableHandler,
  cancelErrorHandler,
  CLIENT_DISCONNECTED,
  createShutdown,
  getRequestSignal,
  HANDLER_TIMEOUT,
  SERVER_SHUTDOWN,
} from './index';

const servers: Server[] = [];
const sockets: Socket[] = [];
const restores: (() => void)[] = [];

afterEach(async () => {
  for (const restore of restores.splice(0)) {
    restore();
  }

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
    const started = deferred();
    const finished = deferred();
    const disconnects: CancelError[] = [];
    let written: { headersSent: boolean; writableEnded: boolean } | undefined;

    const port = await listen(
      cancelableHandler(
        function* (_req: IncomingMessage, res: ServerResponse) {
          started.resolve();

          try {
            yield never();
            res.end('unreachable');
          } finally {
            written = { headersSent: res.headersSent, writableEnded: res.writableEnded };
            finished.resolve();
          }
        },
        { onDisconnect: (reason) => disconnects.push(reason) },
      ),
    );
    const client = await rawRequest(port, 'GET /hang HTTP/1.1\r\nHost: localhost\r\n\r\n');

    await started.promise;
    client.destroy();
    await finished.promise;

    expect(written).toEqual({ headersSent: false, writableEnded: false });
    expect(disconnects).toHaveLength(1);
    expect(isCancelError(disconnects[0])).toBe(true);
    expect(disconnects[0].timedOut).toBe(false);
  });
});

describe('request with a body', () => {
  it('completes a POST that reads its own body instead of canceling it', async () => {
    const disconnects: CancelError[] = [];

    const port = await listen(
      cancelableHandler(
        function* (req: IncomingMessage, res: ServerResponse) {
          const body: unknown = yield readBody(req);

          // a real suspension point: a signal wired from the request stream aborts before this
          // resumes, so a regression stops the handler right here instead of answering
          yield CancelablePromise.resolve();

          res.end(body as string);
        },
        { onDisconnect: (reason) => disconnects.push(reason) },
      ),
    );

    const response = await httpRequest(port, { body: 'kept', method: 'POST', path: '/echo' });

    expect(response.status).toBe(200);
    expect(response.body).toBe('kept');
    expect(disconnects).toEqual([]);
  });
});

describe('deadline', () => {
  it('answers with the configured status while the client is still connected', async () => {
    const timeouts: CancelError[] = [];

    const port = await listen(
      cancelableHandler(
        function* (_req: IncomingMessage, res: ServerResponse) {
          yield never();
          res.end('unreachable');
        },
        { onTimeout: (reason) => timeouts.push(reason), timeout: { ms: 25, status: 504 } },
      ),
    );

    const response = await httpRequest(port, { path: '/slow' });

    expect(response.status).toBe(504);
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].timedOut).toBe(true);
  });

  it('falls back to the default status for the millisecond shorthand', async () => {
    const port = await listen(
      cancelableHandler(
        function* (_req: IncomingMessage, res: ServerResponse) {
          yield never();
          res.end('unreachable');
        },
        { timeout: 25 },
      ),
    );

    expect((await httpRequest(port, { path: '/slow' })).status).toBe(503);
  });
});

describe('cancel attribution over a real socket', () => {
  it('answers the deadline status and headers when a derived child rejects with the request', async () => {
    const port = await listen(
      cancelableHandler(
        function* (req: IncomingMessage, res: ServerResponse) {
          const child = never();

          getRequestSignal(req, res).addEventListener(
            'abort',
            () => {
              child.cancel();
            },
            { once: true },
          );
          try {
            yield child;
          } catch {
            throw new CancelError('derived');
          }
          res.end('unreachable');
        },
        { timeout: { ms: 25, status: 504, headers: { 'Retry-After': '5' } } },
      ),
    );

    const response = await httpExchange(port, { path: '/derived' });

    expect(response.status).toBe(504);
    expect(response.headers['retry-after']).toBe('5');
  });

  it('leaves a plain handler error that lands during a shutdown uncounted as canceled', async () => {
    const arrived = deferred();
    const port = await listen((req, res) => {
      arrived.resolve();
      setTimeout(() => {
        try {
          cancelErrorHandler({ rethrow: true })(new Error('boom'), req, res);
        } catch {
          setTimeout(() => res.end('late'), 120);
        }
      }, 30);
    });

    const shutdown = createShutdown(lastServer());
    const response = httpExchange(port, { path: '/plain' });

    await arrived.promise;

    expect(await shutdown({ cancelAfter: 60 })).toEqual({ canceled: 0, completed: 1, timedOut: false });
    expect((await response).body).toBe('late');
  });

  it('answers a user cancellation stamped 499 with 500, not the caller status, on a live request', async () => {
    const logged = captureErrorLog();

    const port = await listen(
      cancelableHandler(function* () {
        throw Object.assign(new CancelError('user'), { status: 499, headers: { 'Retry-After': '5' } });
        yield never();
      }),
    );

    const response = await httpExchange(port, { path: '/user' });

    expect(response.status).toBe(500);
    expect(response.headers['retry-after']).toBeUndefined();
    expect(logged).toHaveLength(1);
  });
});

describe('request deadline timing', () => {
  useDeadlineClock();

  it('restarts from a timeout set by a wrapped handler further in', async () => {
    const reached = deferred();
    let signal!: AbortSignal;

    const inner = cancelableHandler(
      function* (req: IncomingMessage, res: ServerResponse) {
        signal = getRequestSignal(req, res);
        reached.resolve();
        yield never();
        res.end('unreachable');
      },
      { timeout: 200 },
    );
    const port = await listen(
      cancelableHandler(
        function* (req: IncomingMessage, res: ServerResponse) {
          inner(req, res);
          yield never();
        },
        { timeout: 50 },
      ),
    );

    const response = httpRequest(port, { path: '/slow' });
    await reached.promise;

    // past the outer deadline, which the inner timeout replaced
    jest.advanceTimersByTime(100);
    expectAbortAt(signal, 100);
    expect((await response).status).toBe(503);
  });
});

describe('request deadline', () => {
  it('stops once the handler returned, while its body still streams', async () => {
    const timeouts: CancelError[] = [];
    let abortedAtEnd: boolean | undefined;

    const port = await listen(
      cancelableHandler(
        function* (req: IncomingMessage, res: ServerResponse) {
          const signal = getRequestSignal(req, res);

          streamBody(res, () => {
            abortedAtEnd = signal.aborted;
          });
        },
        { onTimeout: (reason) => timeouts.push(reason), timeout: 50 },
      ),
    );

    const response = await streamedRequest(port, '/stream');

    expect(response).toMatchObject({ body: STREAMED_BODY, complete: true, failed: false, status: 200 });
    expect(abortedAtEnd).toBe(false);
    expect(timeouts).toEqual([]);
  });

  it('reports a deadline once however many wrapped layers the request passed', async () => {
    const timeouts: CancelError[] = [];
    const onTimeout = (reason: CancelError) => timeouts.push(reason);

    const route = cancelableHandler(
      function* (_req: IncomingMessage, res: ServerResponse) {
        yield never();
        res.end('unreachable');
      },
      { onTimeout },
    );
    const middle = cancelableHandler(
      function* (req: IncomingMessage, res: ServerResponse) {
        route(req, res);
        yield never();
      },
      { onTimeout },
    );
    const port = await listen(
      cancelableHandler(
        function* (req: IncomingMessage, res: ServerResponse) {
          middle(req, res);
          yield never();
        },
        { onTimeout, timeout: 50 },
      ),
    );

    expect((await httpRequest(port, { path: '/slow' })).status).toBe(503);
    await settleTurns();
    expect(timeouts).toHaveLength(1);
  });

  it('keeps the close listeners on the response bounded across twelve wrapped layers', async () => {
    const warnings = recordWarnings();
    let closeListeners = -1;
    let abortListeners = -1;

    const route = cancelableHandler(function* (req: IncomingMessage, res: ServerResponse) {
      abortListeners = getEventListeners(getRequestSignal(req, res), 'abort').length;
      res.end('ok');
    });
    let deep = route;

    for (let layer = 0; layer < 11; layer += 1) {
      const inner = deep;
      deep = cancelableHandler(function* (req: IncomingMessage, res: ServerResponse) {
        inner(req, res);
      });
    }

    const port = await listen((req, res) => {
      // counts only what the wrapped chain adds: Node's own close listeners vary by version
      const before = res.listenerCount('close');
      // read at finish: every layer has registered whatever it registers by then, none removed yet
      res.on('finish', () => {
        closeListeners = res.listenerCount('close') - before;
      });
      deep(req, res);
    });

    expect((await httpRequest(port, { path: '/deep' })).body).toBe('ok');
    await settleTurns();
    // the disconnect wiring, plus the request registry of a server met for the first time
    expect(closeListeners).toBe(2);
    // read inside the route, the one in-flight forwarder however many layers
    expect(abortListeners).toBe(1);
    expect(warnings.stop()).toEqual([]);
  });
});

describe('cancellation after the head was sent', () => {
  it('cuts a chunked body short instead of ending it cleanly', async () => {
    const port = await listen(
      cancelableHandler(
        function* (_req: IncomingMessage, res: ServerResponse) {
          res.write('[{"row":1},');
          yield never();
          res.end('{"row":2}]');
        },
        { timeout: 25 },
      ),
    );

    const response = await streamedRequest(port, '/export');

    expect(response.status).toBe(200);
    expect(response.body).toBe('[{"row":1},');
    expect(response.complete).toBe(false);
    expect(response.failed).toBe(true);
  });

  it('cuts a chunked body short when the server shuts down', async () => {
    const started = deferred();

    const port = await listen(
      cancelableHandler(function* (_req: IncomingMessage, res: ServerResponse) {
        res.write('[{"row":1},');
        started.resolve();
        yield never();
        res.end('{"row":2}]');
      }),
    );

    const pending = streamedRequest(port, '/export');
    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 200 });

    const response = await pending;

    expect(response.complete).toBe(false);
    expect(response.failed).toBe(true);
  });
});

describe('onError', () => {
  it('defaults to cancelErrorHandler, answering a deadline with its status', async () => {
    const port = await listen(
      cancelableHandler(
        function* (_req: IncomingMessage, res: ServerResponse) {
          yield never();
          res.end('unreachable');
        },
        { timeout: { ms: 25, status: 507 } },
      ),
    );

    expect((await httpRequest(port, { path: '/slow' })).status).toBe(507);
  });

  it('routes anything the wrapper cannot swallow to the given handler instead of the default', async () => {
    const forwarded: unknown[] = [];

    const port = await listen(
      cancelableHandler(
        function* (_req: IncomingMessage, res: ServerResponse) {
          yield never();
          res.end('unreachable');
        },
        {
          onError: (error, _req, res) => {
            forwarded.push(error);
            res.statusCode = 599;
            res.end();
          },
          timeout: 25,
        },
      ),
    );

    expect((await httpRequest(port, { path: '/slow' })).status).toBe(599);
    expect(forwarded).toHaveLength(1);
    expect(isCancelError(forwarded[0])).toBe(true);
  });

  it('answers 500 when a handler throws and nothing else is configured', async () => {
    const logged = captureErrorLog();

    const port = await listen(
      cancelableHandler(function* (_req: IncomingMessage, _res: ServerResponse) {
        throw new Error('boom');
      }),
    );

    expect((await httpRequest(port, { path: '/throws' })).status).toBe(500);
    expect(logged).toHaveLength(1);
  });

  it('answers 500 when a handler rejects and nothing else is configured', async () => {
    const logged = captureErrorLog();

    const port = await listen(
      cancelableHandler(async (_req: IncomingMessage, _res: ServerResponse) => {
        await Promise.resolve();

        throw new Error('boom');
      }),
    );

    expect((await httpRequest(port, { path: '/rejects' })).status).toBe(500);
    expect(logged).toHaveLength(1);
  });

  it('hands a plain failure to the given handler instead of answering 500', async () => {
    const failure = new Error('boom');
    const forwarded: unknown[] = [];

    const port = await listen(
      cancelableHandler(
        function* (_req: IncomingMessage, _res: ServerResponse) {
          throw failure;
        },
        {
          onError: (error, _req, res) => {
            forwarded.push(error);
            res.statusCode = 418;
            res.end();
          },
        },
      ),
    );

    expect((await httpRequest(port, { path: '/throws' })).status).toBe(418);
    expect(forwarded).toEqual([failure]);
  });
});

describe('handler that throws synchronously', () => {
  it('reaches the error handler instead of escaping the request listener', async () => {
    const failure = new Error('boom');
    const forwarded: unknown[] = [];
    const uncaught: unknown[] = [];
    const probe = (error: unknown) => uncaught.push(error);
    process.on('uncaughtException', probe);

    try {
      const port = await listen(
        cancelableHandler(
          () => {
            throw failure;
          },
          {
            onError: (error, _req, res) => {
              forwarded.push(error);
              res.statusCode = 599;
              res.end();
            },
          },
        ),
      );

      const response = await answerWithin(httpRequest(port, { path: '/throws' }), 1000);

      expect(response.status).toBe(599);
      expect(forwarded).toEqual([failure]);
      expect(uncaught).toEqual([]);
    } finally {
      process.off('uncaughtException', probe);
    }
  });
});

describe('cancellation after the response ended', () => {
  it('is dropped instead of forwarded', async () => {
    const forwarded: unknown[] = [];

    const port = await listen(
      cancelableHandler(
        function* (_req: IncomingMessage, res: ServerResponse) {
          res.end('answered');
          yield CancelablePromise.resolve();

          throw new CancelError(SERVER_SHUTDOWN);
        },
        { onError: (error) => forwarded.push(error) },
      ),
    );

    const response = await httpRequest(port, { path: '/late' });

    expect(response).toEqual({ body: 'answered', status: 200 });
    expect(forwarded).toEqual([]);
  });
});

describe('request signal', () => {
  it('is one signal per request, shared with work started outside the handler', async () => {
    const started = deferred();
    const aborted = deferred();
    let sameSignal = false;

    const port = await listen(
      cancelableHandler(function* (req: IncomingMessage, res: ServerResponse) {
        const signal = getRequestSignal(req, res);
        sameSignal = getRequestSignal(req, res) === signal && isCancelSignal(signal);
        signal.addEventListener('abort', () => aborted.resolve(), { once: true });

        started.resolve();
        yield never();
      }),
    );
    const client = await rawRequest(port, 'GET /hang HTTP/1.1\r\nHost: localhost\r\n\r\n');

    await started.promise;
    client.destroy();
    await aborted.promise;

    expect(sameSignal).toBe(true);
  });
});

describe('cancel error handler', () => {
  it('answers 500 and logs anything that is not a cancellation', () => {
    const logged = captureErrorLog();
    const failure = new Error('boom');
    const { calls, res } = fakeResponse();

    cancelErrorHandler()(failure, fakeRequest(), res);

    expect(calls.ended).toBe(1);
    expect(res.statusCode).toBe(500);
    expect(logged).toEqual([[expect.any(String), failure]]);
  });

  it('rethrows anything that is not a cancellation once asked to', () => {
    const failure = new Error('boom');
    const { calls, res } = fakeResponse();

    expect(() => cancelErrorHandler({ rethrow: true })(failure, fakeRequest(), res)).toThrow(failure);
    expect(calls.ended).toBe(0);
  });

  it('logs a failure it can no longer answer', () => {
    const logged = captureErrorLog();
    const { calls, res } = fakeResponse({ destroyed: true });

    cancelErrorHandler()(new Error('boom'), fakeRequest(), res);

    expect(calls.ended).toBe(0);
    expect(logged).toHaveLength(1);
  });

  it('drops a cancellation whose client is already gone', () => {
    const { calls, res } = fakeResponse({ destroyed: true });

    cancelErrorHandler()(new CancelError(SERVER_SHUTDOWN), ownedRequest(SERVER_SHUTDOWN), res);

    expect(calls.ended).toBe(0);
  });

  it('answers 500 for a stamped cancellation the request never canceled', () => {
    const logged = captureErrorLog();
    const stamped = Object.assign(new CancelError(HANDLER_TIMEOUT), { status: 504 });
    const { calls, res } = fakeResponse();

    cancelErrorHandler()(stamped, fakeRequest(), res);

    expect(calls.ended).toBe(1);
    expect(res.statusCode).toBe(500);
    expect(logged).toEqual([[expect.any(String), stamped]]);
  });

  it('treats a cancellation carrying no status like any other failure', () => {
    const { calls, res } = fakeResponse();
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    cancelErrorHandler({ status: 499 })(new CancelError(CLIENT_DISCONNECTED), fakeRequest(), res);

    expect(calls.ended).toBe(1);
    expect(res.statusCode).toBe(500);
    logged.mockRestore();
  });

  it('answers a deadline with the status stamped on it', () => {
    const deadline = Object.assign(new CancelError(HANDLER_TIMEOUT), { status: 504 });
    const { calls, res } = fakeResponse();

    cancelErrorHandler()(deadline, ownedRequest(HANDLER_TIMEOUT), res);

    expect(calls.ended).toBe(1);
    expect(res.statusCode).toBe(504);
  });

  it('reads statusCode when status is absent', () => {
    const foreign = Object.assign(new CancelError(HANDLER_TIMEOUT), { statusCode: 504 });
    const { res } = fakeResponse();

    cancelErrorHandler()(foreign, ownedRequest(HANDLER_TIMEOUT), res);

    expect(res.statusCode).toBe(504);
  });
});

describe('framework headers on a cancel answer', () => {
  it('answers a deadline clean: no stale content headers, the timeout headers applied', async () => {
    const port = await listen(
      cancelableHandler(
        function* (_req: IncomingMessage, res: ServerResponse) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Encoding', 'gzip');
          yield never();
          res.end('unreachable');
        },
        { timeout: { ms: 25, headers: { 'Retry-After': '5' } } },
      ),
    );

    const response = await httpExchange(port, { path: '/slow' });

    expect(response.status).toBe(503);
    expect(response.headers['retry-after']).toBe('5');
    expect(response.headers['content-type']).toBeUndefined();
    expect(response.headers['content-encoding']).toBeUndefined();
  });

  it('logs a late failure once through the console', async () => {
    const logged = captureErrorLog();

    const port = await listen(
      cancelableHandler(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          throw new Error('late');
        },
        { timeout: 20 },
      ),
    );

    const response = await httpRequest(port, { path: '/late' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(response.status).toBe(503);
    expect(logged.filter((entry) => String(entry[0]).includes('late'))).toHaveLength(1);
  });
});

describe('handler kinds', () => {
  it('answers 500 and logs a TypeError for an async generator handler', async () => {
    const logged = captureErrorLog();
    const port = await listen(cancelableHandler(asyncGeneratorHandler as never));

    expect((await httpRequest(port, { path: '/' })).status).toBe(500);
    expect(logged).toHaveLength(1);
    expect(logged[0][1]).toBeInstanceOf(TypeError);
  });

  it('skips a handler whose caller signal was already aborted', async () => {
    const handler = jest.fn();
    const port = await listen(cancelableHandler(handler, { signal: AbortSignal.abort() }));

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
    const started = deferred();

    const port = await listen(
      cancelableHandler(function* (_req: IncomingMessage, res: ServerResponse) {
        started.resolve();
        yield never();
        res.end('unreachable');
      }),
    );
    const pending = httpRequest(port, { path: '/hang' });

    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 200 });

    expect((await pending).status).toBe(503);
  });

  it('takes the handler status over the stamped 503 for a shutdown cancel', async () => {
    const started = deferred();

    const port = await listen(
      cancelableHandler(
        function* (_req: IncomingMessage, res: ServerResponse) {
          started.resolve();
          yield never();
          res.end('unreachable');
        },
        { onError: cancelErrorHandler({ status: 502 }) },
      ),
    );
    const pending = httpRequest(port, { path: '/hang' });

    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 200 });

    expect((await pending).status).toBe(502);
  });

  it('answers the shutdown status and headers without a handler error handler', async () => {
    const started = deferred();

    const port = await listen(
      cancelableHandler(function* (_req: IncomingMessage, res: ServerResponse) {
        started.resolve();
        yield never();
        res.end('unreachable');
      }),
    );
    const pending = httpExchange(port, { path: '/hang' });

    await started.promise;
    await createShutdown(lastServer())({ cancelAfter: 200, headers: { 'Retry-After': '5' }, status: 504 });

    const answer = await pending;

    expect(answer.status).toBe(504);
    expect(answer.headers['retry-after']).toBe('5');
  });

  it('keeps a deadline status over the handler status', async () => {
    const port = await listen(
      cancelableHandler(
        function* (_req: IncomingMessage, res: ServerResponse) {
          yield never();
          res.end('unreachable');
        },
        { timeout: { ms: 20, status: 504 }, onError: cancelErrorHandler({ status: 502 }) },
      ),
    );

    expect((await httpRequest(port, { path: '/slow' })).status).toBe(504);
  });

  it('gives each in-flight request its own shutdown cancellation', async () => {
    const reasons: unknown[] = [];
    let entered = 0;
    const bothStarted = deferred();

    const port = await listen(
      cancelableHandler(function* (req: IncomingMessage, res: ServerResponse) {
        const signal = getRequestSignal(req, res);
        signal.addEventListener('abort', () => reasons.push(signal.reason));
        entered += 1;
        if (entered === 2) {
          bothStarted.resolve();
        }
        yield never();
        res.end('unreachable');
      }),
    );
    const pending = [httpRequest(port, { path: '/hang' }), httpRequest(port, { path: '/hang' })];

    await bothStarted.promise;
    await createShutdown(lastServer())({ cancelAfter: 200 });
    await Promise.all(pending);

    expect(reasons).toHaveLength(2);
    expect(reasons[0]).not.toBe(reasons[1]);
  });

  it('answers 503 for a request that arrives during a cancel-on-start drain', async () => {
    const port = await listen(
      cancelableHandler(function* (_req: IncomingMessage, res: ServerResponse) {
        yield never();
        res.end('unreachable');
      }),
    );
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
    const reached = deferred();
    const events: string[] = [];

    const port = await listen((req, res) => {
      getRequestSignal(req, res).addEventListener('abort', () => {
        setTimeout(() => {
          events.push('answered');
          res.statusCode = 503;
          res.end();
        }, 30);
      });
      reached.resolve();
    });
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
    const started = deferred();
    const events: string[] = [];

    const port = await listen(
      cancelableHandler(function* (_req: IncomingMessage, res: ServerResponse) {
        started.resolve();
        try {
          yield never();
          res.end('unreachable');
        } finally {
          yield new CancelablePromise<void>((resolve) => setTimeout(resolve, 50));
          events.push('cleaned');
        }
      }),
    );
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
    const started = deferred();
    const disconnects: CancelError[] = [];

    const port = await listen(
      cancelableHandler(
        function* (_req: IncomingMessage, res: ServerResponse) {
          started.resolve();
          yield never();
          res.end('unreachable');
        },
        { onDisconnect: (reason) => disconnects.push(reason) },
      ),
    );
    const pending = httpRequest(port, { path: '/hang' });

    await started.promise;
    const result = await createShutdown(lastServer())({ cancelAfter: 200 });

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect((await pending).status).toBe(503);
    expect(disconnects).toEqual([]);
  });

  it('exits on a handler that ignores its cancellation', async () => {
    const started = deferred();

    const port = await listen(
      cancelableHandler(
        function* (_req: IncomingMessage, _res: ServerResponse) {
          started.resolve();
          yield never();
        },
        // a shielded handler ignores the cancellation a shutdown sends it, which is the case the grace
        // window exists for
        { shield: true },
      ),
    );
    const client = await rawRequest(port, 'GET /shielded HTTP/1.1\r\nHost: localhost\r\n\r\n');

    await started.promise;
    const result = await createShutdown(lastServer())({ cancelAfter: 100 });
    client.destroy();

    expect(result.timedOut).toBe(true);
  });

  it('is idempotent while it is running', async () => {
    await listen(
      cancelableHandler(function* (_req: IncomingMessage, res: ServerResponse) {
        res.end('ok');
      }),
    );
    const server = lastServer();
    const first = createShutdown(server)({ cancelAfter: 100 });

    expect(createShutdown(server)()).toBe(first);
    expect(await first).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });
});

interface IResponseCalls {
  ended: number;
}

/** The three response members the error handler reads, plus a record of what it wrote. */
function fakeResponse(state: { destroyed?: boolean; headersSent?: boolean; writableEnded?: boolean } = {}): {
  calls: IResponseCalls;
  res: ServerResponse;
} {
  const calls: IResponseCalls = { ended: 0 };
  const res = {
    destroyed: false,
    end: () => {
      calls.ended += 1;

      return res;
    },
    headersSent: false,
    once: () => res,
    removeHeader: () => undefined,
    setHeader: () => undefined,
    statusCode: 200,
    writableEnded: false,
    ...state,
  };

  return { calls, res: res as unknown as ServerResponse };
}

function fakeRequest(): IncomingMessage {
  return {} as IncomingMessage;
}

/** A request whose state is canceled with `reason`, the way a deadline or a shutdown cancels it. */
function ownedRequest(reason: unknown): IncomingMessage {
  const req = fakeRequest();
  const { res } = fakeResponse();

  ensureRequestCancelState(toRequestLike(req), toResponseLike(res)).cancel(reason);

  return req;
}

/** Collects what the default error path logs, and keeps a failing handler from printing mid-run. */
function captureErrorLog(): unknown[][] {
  const entries: unknown[][] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    entries.push(args);
  });

  restores.push(() => spy.mockRestore());

  return entries;
}

/** Reads a request body to completion, standing in for a body parser. */
function readBody(req: IncomingMessage): CancelablePromise<string> {
  return new CancelablePromise<string>((resolve, reject) => {
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

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
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

/** Starts a raw server on an ephemeral port and hands back the port it got. */
async function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<number> {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0);
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

/** Bounds a wait for an answer, so a request nothing ever replies to fails as an assertion rather than a suite timeout. */
function answerWithin(
  response: Promise<{ status: number; body: string }>,
  ms: number,
): Promise<{ status: number; body: string }> {
  const unanswered = new Promise<{ status: number; body: string }>((resolve) => {
    setTimeout(() => resolve({ body: '', status: 0 }), ms).unref();
  });

  return Promise.race([response, unanswered]);
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

const STREAMED_CHUNKS = 6;
const STREAMED_BODY = 'chunk\n'.repeat(STREAMED_CHUNKS);

/** Writes a chunked body over roughly 300ms, well past a 50ms deadline, then ends it. */
function streamBody(res: ServerResponse, onEnd: () => void): void {
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

describe('an app keep-alive set during the shutdown', () => {
  it('is overridden, so the answer still closes its connection', async () => {
    const arrived = deferred();
    const release = deferred();

    const port = await listen((_req, res) => {
      arrived.resolve();
      void release.promise.then(() => {
        res.setHeader('Connection', 'keep-alive');
        res.end('ok');
      });
    });
    const shutdown = createShutdown(lastServer());
    const client = await rawRequest(port, 'GET /late HTTP/1.1\r\nHost: localhost\r\n\r\n');
    client.setEncoding('utf8');
    let received = '';
    client.on('data', (chunk: string) => {
      received += chunk;
    });
    const closed = once(client, 'close');

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
    const server = createServer((req, res) => {
      if (req.url === '/fast') {
        res.end('ok');
        return;
      }

      if (req.url === '/close' || req.url === '/flush') {
        res.setHeader('Connection', 'close');
      }
      if (req.url === '/flush') {
        res.flushHeaders();
      }

      arrived();
      void release.then(() => res.end('ok'));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    return { server, target: server };
  },
  { appSetHeaders: true },
);

describe('cancelErrorHandler status range', () => {
  it('throws a RangeError for a status outside 200 to 599 at the factory', () => {
    expect(() => cancelErrorHandler({ status: 199 })).toThrow(RangeError);
    expect(() => cancelErrorHandler({ status: 600 })).toThrow(RangeError);
    expect(() => cancelErrorHandler({ status: 502.5 })).toThrow(RangeError);
    expect(() => cancelErrorHandler({ status: 200 })).not.toThrow();
    expect(() => cancelErrorHandler({ status: 599 })).not.toThrow();
  });
});
