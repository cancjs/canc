import { CancelablePromise, CancelError, isCancelError, isCancelSignal } from '@cancjs/promise';
import { once } from 'events';
import { createServer, IncomingMessage, request, Server, ServerResponse } from 'http';
import { connect, Socket } from 'net';

import {
  cancelableHandler,
  cancelErrorHandler,
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
        {
          onTimeout: (reason) => timeouts.push(reason),
          timeout: { ms: 25, status: 504 },
        },
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
  it('rethrows anything that is not a cancellation', () => {
    const failure = new Error('boom');
    const { res } = fakeResponse();

    expect(() => cancelErrorHandler()(failure, fakeRequest(), res)).toThrow(failure);
  });

  it('drops a cancellation whose client is already gone', () => {
    const { calls, res } = fakeResponse({ destroyed: true });

    cancelErrorHandler()(new CancelError(SERVER_SHUTDOWN), fakeRequest(), res);

    expect(calls.ended).toBe(0);
  });

  it('stops writing a response whose head already went out', () => {
    const { calls, res } = fakeResponse({ headersSent: true });

    cancelErrorHandler()(new CancelError(SERVER_SHUTDOWN), fakeRequest(), res);

    expect(calls.ended).toBe(1);
  });

  it('answers a cancellation carrying no status with the configured fallback', () => {
    const { calls, res } = fakeResponse();

    cancelErrorHandler({ status: 499 })(new CancelError(CLIENT_DISCONNECTED), fakeRequest(), res);

    expect(calls.ended).toBe(1);
    expect(res.statusCode).toBe(499);
  });

  it('answers a deadline with the status stamped on it', () => {
    const deadline = Object.assign(new CancelError(HANDLER_TIMEOUT), { status: 504 });
    const { calls, res } = fakeResponse();

    cancelErrorHandler()(deadline, fakeRequest(), res);

    expect(calls.ended).toBe(1);
    expect(res.statusCode).toBe(504);
  });

  it('reads statusCode when status is absent', () => {
    const foreign = Object.assign(new CancelError(HANDLER_TIMEOUT), { statusCode: 504 });
    const { res } = fakeResponse();

    cancelErrorHandler()(foreign, fakeRequest(), res);

    expect(res.statusCode).toBe(504);
  });
});

describe('shutdown', () => {
  it('cancels a live request and reports the outcome', async () => {
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
    const result = await shutdown(lastServer(), { timeout: 1000 });

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
    const result = await shutdown(lastServer(), { timeout: 100 });
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
    const first = shutdown(server, { timeout: 100 });

    expect(shutdown(server)).toBe(first);
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
    statusCode: 200,
    writableEnded: false,
    ...state,
  };

  return { calls, res: res as unknown as ServerResponse };
}

function fakeRequest(): IncomingMessage {
  return {} as IncomingMessage;
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
