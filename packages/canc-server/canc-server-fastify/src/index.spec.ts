import { getEventListeners, once } from 'node:events';
import http, { IncomingHttpHeaders } from 'node:http';
import { AddressInfo, connect, Socket } from 'node:net';
import { Readable } from 'node:stream';
import { runInThisContext } from 'node:vm';

import { CancelablePromise, CancelError, isCancelError, isCancelSignal, TimeoutError } from '@cancjs/promise';
import Fastify, { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';

import { expectAbortAt, useDeadlineClock } from '../../../_server/__tests__/deadline-clock';
import { describeShutdownSockets } from '../../../_server/__tests__/shutdown-sockets';
import {
  cancelableHandler,
  cancelErrorHandler,
  cancelPlugin,
  createShutdown,
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

interface IClientExchange extends IClientResponse {
  headers: IncomingHttpHeaders;
}

function deferred<T = void>(): IDeferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

// drains the immediate queue instead of waiting a fixed time: the wrapper's catch and fastify's
// own send path run on later turns than the handler's finally
function tick(times = 3): Promise<void> {
  let chain = Promise.resolve();

  for (let index = 0; index < times; index += 1) {
    chain = chain.then(() => new Promise<void>((resolve) => setImmediate(resolve)));
  }

  return chain;
}

let app: FastifyInstance | undefined;

async function listen(instance: FastifyInstance): Promise<number> {
  app = instance;
  await instance.listen({ host: '127.0.0.1', port: 0 });

  return (instance.server.address() as AddressInfo).port;
}

function send(port: number, path: string, method = 'GET', body?: string): Promise<IClientResponse> {
  return sendExchange(port, path, method, body).then(({ body: text, statusCode }) => ({ body: text, statusCode }));
}

function sendExchange(port: number, path: string, method = 'GET', body?: string): Promise<IClientExchange> {
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
        response.on('end', () =>
          resolve({
            body: Buffer.concat(chunks).toString(),
            headers: response.headers,
            statusCode: response.statusCode,
          }),
        );
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

const sockets: Socket[] = [];

// a raw connection the test can destroy right after the connect handshake, before fastify has a
// chance to route it, which a pooled http.request cannot guarantee
async function rawRequest(port: number, payload: string): Promise<Socket> {
  const client = connect(port, '127.0.0.1');
  sockets.push(client);
  client.on('error', () => undefined);
  await once(client, 'connect');
  client.write(payload);

  return client;
}

afterEach(async () => {
  const instance = app;

  app = undefined;

  for (const socket of sockets.splice(0)) {
    socket.destroy();
  }

  if (instance) {
    await instance.close();
  }
});

describe('client disconnect', () => {
  it('unwinds the handler and leaves the dead socket alone', async () => {
    const started = deferred();
    const settled = deferred();
    let reason: unknown;
    let resumed = false;
    let headersSent: boolean | undefined;
    let ended: boolean | undefined;

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.get(
      '/hang',
      cancelableHandler(
        function* (request, reply) {
          try {
            expect(getRequestSignal(request, reply).aborted).toBe(false);
            started.resolve();
            yield new Promise(() => undefined);
            resumed = true;

            return { ok: true };
          } finally {
            headersSent = reply.raw.headersSent;
            ended = reply.raw.writableEnded;
            settled.resolve();
          }
        },
        {
          // a cancellation unwinds the generator through its return path, so the reason is read
          // from the callback rather than from a catch inside the body
          onDisconnect: (disconnected) => {
            reason = disconnected;
          },
        },
      ),
    );

    const port = await listen(instance);
    const request = open(port, '/hang');

    await started.promise;
    request.destroy();
    await settled.promise;
    await tick();

    expect(isCancelError(reason)).toBe(true);
    expect((reason as CancelError).timedOut).toBe(false);
    expect(resumed).toBe(false);
    expect(headersSent).toBe(false);
    expect(ended).toBe(false);
    expect(instance.server.listening).toBe(true);
  });

  it('never starts a handler whose client left before it was reached', async () => {
    const reported = deferred();
    let invoked = 0;

    const instance = Fastify();
    await instance.register(cancelPlugin);
    // held until the connection is provably gone, so the pre-flight guard is what the assertion
    // measures rather than a destroy racing the next server tick
    instance.addHook('onRequest', (_request, reply, done) => {
      reply.raw.once('close', () => done());
    });
    instance.get(
      '/late',
      cancelableHandler(
        function* () {
          invoked += 1;
        },
        { onDisconnect: () => reported.resolve() },
      ),
    );

    const port = await listen(instance);
    const client = await rawRequest(port, 'GET /late HTTP/1.1\r\nHost: localhost\r\n\r\n');
    client.destroy();
    await reported.promise;

    expect(invoked).toBe(0);
  });

  it('leaves a body carrying post alone', async () => {
    let abortedInHandler: boolean | undefined;

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.post(
      '/echo',
      cancelableHandler(function* (request, reply) {
        yield new Promise<void>((resolve) => setImmediate(resolve));
        abortedInHandler = getRequestSignal(request, reply).aborted;

        return { got: (request.body as { name: string }).name };
      }),
    );

    const port = await listen(instance);
    const response = await send(port, '/echo', 'POST', JSON.stringify({ name: 'kept' }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ got: 'kept' });
    expect(abortedInHandler).toBe(false);
  });
});

describe('deadline', () => {
  it('answers with the configured status while the client is still connected', async () => {
    let reported: CancelError | undefined;

    const instance = Fastify();
    await instance.register(cancelPlugin, { timeout: 60_000 });
    instance.get(
      '/slow',
      cancelableHandler(
        function* () {
          yield new Promise(() => undefined);

          return { ok: true };
        },
        {
          onTimeout: (reason) => {
            reported = reason;
          },
          timeout: { message: 'route took too long', ms: 20, status: 504 },
        },
      ),
    );

    const port = await listen(instance);
    const response = await send(port, '/slow');

    expect(response.statusCode).toBe(504);
    expect(JSON.parse(response.body)).toMatchObject({ message: 'route took too long' });
    expect(reported?.timedOut).toBe(true);
  });

  it('cuts the connection instead of completing a body whose head already went out', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin, { timeout: 60_000 });
    instance.get(
      '/raw',
      cancelableHandler(
        function* (_request, reply) {
          reply.raw.writeHead(200, { 'content-type': 'text/plain' });
          reply.raw.write('part1,');
          yield new Promise(() => undefined);

          return { ok: true };
        },
        { timeout: { ms: 20, status: 504 } },
      ),
    );

    const port = await listen(instance);
    const outcome = await new Promise<{ body: string; complete: boolean }>((resolve) => {
      const outgoing = http.get({ host: '127.0.0.1', path: '/raw', port }, (response) => {
        let body = '';

        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => resolve({ body, complete: response.complete }));
        response.on('error', () => resolve({ body, complete: false }));
      });

      outgoing.on('error', () => resolve({ body: '', complete: false }));
    });

    expect(outcome.complete).toBe(false);
    expect(outcome.body).not.toContain('Cannot write headers');
  });
});

describe('plugin options', () => {
  it('are inherited by every route and overridden per route', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin, { timeout: { ms: 25, status: 504 } });
    instance.get(
      '/inherited',
      cancelableHandler(function* () {
        yield new Promise(() => undefined);

        return { ok: true };
      }),
    );
    instance.get(
      '/overridden',
      cancelableHandler(
        function* () {
          yield new Promise(() => undefined);

          return { ok: true };
        },
        { timeout: { ms: 25, status: 507 } },
      ),
    );

    const port = await listen(instance);

    expect((await send(port, '/inherited')).statusCode).toBe(504);
    expect((await send(port, '/overridden')).statusCode).toBe(507);
  });
});

describe('request deadline timing', () => {
  useDeadlineClock();

  it('fires at the configured time on a plain route', async () => {
    const timeouts: CancelError[] = [];
    const reached = deferred();
    let signal!: AbortSignal;

    const instance = Fastify();
    await instance.register(cancelPlugin, { onTimeout: (reason) => timeouts.push(reason), timeout: 50 });
    instance.get('/plain', async (request, reply) => {
      signal = getRequestSignal(request, reply);
      reached.resolve();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      void reply.code(504);

      return 'aborted';
    });

    const port = await listen(instance);
    const response = send(port, '/plain');
    await reached.promise;

    expectAbortAt(signal, 50);
    expect((await response).statusCode).toBe(504);
    expect(timeouts).toHaveLength(1);
  });

  it('counts the time spent in a hook ahead of a wrapped handler', async () => {
    const upstream = deferred();
    const release = deferred();
    const reached = deferred();
    let signal!: AbortSignal;

    const instance = Fastify();
    await instance.register(cancelPlugin, { timeout: 100 });
    instance.get(
      '/slow',
      {
        preHandler: async () => {
          upstream.resolve();
          await release.promise;
        },
      },
      cancelableHandler(function* (request, reply) {
        signal = getRequestSignal(request, reply);
        reached.resolve();
        yield new Promise(() => undefined);

        return { ok: true };
      }),
    );

    const port = await listen(instance);
    const response = send(port, '/slow');
    await upstream.promise;

    jest.advanceTimersByTime(60);
    release.resolve();
    await reached.promise;

    expectAbortAt(signal, 40);
    expect((await response).statusCode).toBe(503);
  });

  it('restarts from a route timeout behind a wrapped hook', async () => {
    const reached = deferred();
    let signal!: AbortSignal;

    const instance = Fastify();
    await instance.register(cancelPlugin, { timeout: 50 });
    instance.get(
      '/slow',
      { preHandler: passThrough() },
      cancelableHandler(
        function* (request, reply) {
          signal = getRequestSignal(request, reply);
          reached.resolve();
          yield new Promise(() => undefined);

          return { ok: true };
        },
        { timeout: 200 },
      ),
    );

    const port = await listen(instance);
    const response = send(port, '/slow');
    await reached.promise;

    // past the plugin deadline, which the route timeout replaced
    jest.advanceTimersByTime(100);
    expectAbortAt(signal, 100);
    expect((await response).statusCode).toBe(503);
  });
});

describe('request deadline', () => {
  it('stops once the handler returned, while its body still streams', async () => {
    const timeouts: CancelError[] = [];
    let abortedAtEnd: boolean | undefined;

    const instance = Fastify();
    instance.get(
      '/stream',
      cancelableHandler(
        function* (request, reply) {
          const signal = getRequestSignal(request, reply);

          return slowBody(() => {
            abortedAtEnd = signal.aborted;
          });
        },
        { onTimeout: (reason) => timeouts.push(reason), timeout: 50 },
      ),
    );

    const port = await listen(instance);
    const response = await send(port, '/stream');

    expect(response).toEqual({ body: STREAMED_BODY, statusCode: 200 });
    expect(abortedAtEnd).toBe(false);
    expect(timeouts).toEqual([]);
  });

  it('reports a deadline once however many wrapped layers the request passed', async () => {
    const timeouts: CancelError[] = [];

    const instance = Fastify();
    await instance.register(cancelPlugin, { onTimeout: (reason) => timeouts.push(reason), timeout: 50 });
    instance.get(
      '/slow',
      { preHandler: [passThrough(), passThrough()] },
      cancelableHandler(function* () {
        yield new Promise(() => undefined);

        return { ok: true };
      }),
    );

    const port = await listen(instance);

    expect((await send(port, '/slow')).statusCode).toBe(503);
    await tick(5);
    expect(timeouts).toHaveLength(1);
  });

  it('keeps the close listeners on the response bounded across twelve wrapped layers', async () => {
    const warnings = recordWarnings();
    let closeListeners = -1;
    let abortListeners = -1;

    const instance = Fastify();
    // read at finish: every layer has registered whatever it registers by then, none removed yet
    instance.addHook('onRequest', (_request, reply, done) => {
      // counts only what the wrapped chain adds: Node's own close listeners vary by version
      const before = reply.raw.listenerCount('close');
      reply.raw.on('finish', () => {
        closeListeners = reply.raw.listenerCount('close') - before;
      });
      done();
    });
    instance.get(
      '/deep',
      { preHandler: Array.from({ length: 11 }, () => passThrough()) },
      cancelableHandler(function* (request, reply) {
        abortListeners = getEventListeners(getRequestSignal(request, reply), 'abort').length;

        return 'ok';
      }),
    );

    const port = await listen(instance);

    expect((await send(port, '/deep')).body).toBe('ok');
    await tick(5);
    // the disconnect wiring, plus the request registry of a server met for the first time
    expect(closeListeners).toBe(2);
    // read inside the route, the one in-flight forwarder however many layers
    expect(abortListeners).toBe(1);
    expect(warnings.stop()).toEqual([]);
  });
});

describe('request signal', () => {
  it('is one signal per request, shared with work started outside the route', async () => {
    const started = deferred();
    const aborted = deferred();
    let sameSignal = false;

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.addHook('preHandler', async (request, reply) => {
      const signal = getRequestSignal(request, reply);
      sameSignal = getRequestSignal(request, reply) === signal && isCancelSignal(signal);
      signal.addEventListener('abort', () => aborted.resolve(), { once: true });
    });
    instance.get(
      '/hang',
      cancelableHandler(function* () {
        started.resolve();
        yield new Promise(() => undefined);
      }),
    );

    const port = await listen(instance);
    const request = open(port, '/hang');

    await started.promise;
    request.destroy();
    await aborted.promise;

    expect(sameSignal).toBe(true);
  });
});

describe('error handler', () => {
  it('answers a cancellation raised on a live connection', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler());
    const routeAbort = new AbortController();
    instance.get(
      '/give-up',
      cancelableHandler(
        function* () {
          yield new Promise<void>(() => undefined);
        },
        { signal: routeAbort.signal },
      ),
    );

    const port = await listen(instance);
    const pending = send(port, '/give-up');

    setTimeout(() => routeAbort.abort(), 20);

    const response = await pending;

    expect(response.statusCode).toBe(503);
  });

  it('leaves a user cancellation to fastify, so its own status goes out and not the option', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler({ status: 502 }));
    instance.get(
      '/user',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw Object.assign(new CancelError('user stop'), { status: 499 });
      }),
    );

    const port = await listen(instance);
    const response = await send(port, '/user');

    expect(response.statusCode).toBe(499);
  });

  it('answers a shutdown cancellation with the configured status', async () => {
    const started = deferred();

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler({ status: 499 }));
    instance.get(
      '/hang',
      cancelableHandler(function* () {
        started.resolve();
        yield new Promise(() => undefined);

        return { ok: true };
      }),
    );

    const port = await listen(instance);
    const pending = send(port, '/hang');
    await started.promise;
    await createShutdown(instance)({ cancelAfter: 200 });

    expect((await pending).statusCode).toBe(499);
  });

  it('still reads the deprecated canceledStatus key', async () => {
    const started = deferred();

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler({ canceledStatus: 498 }));
    instance.get(
      '/hang',
      cancelableHandler(function* () {
        started.resolve();
        yield new Promise(() => undefined);

        return { ok: true };
      }),
    );

    const port = await listen(instance);
    const pending = send(port, '/hang');
    await started.promise;
    await createShutdown(instance)({ cancelAfter: 200 });

    expect((await pending).statusCode).toBe(498);
  });

  it('prefers status over the deprecated canceledStatus key', async () => {
    const started = deferred();

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler({ status: 499, canceledStatus: 498 }));
    instance.get(
      '/hang',
      cancelableHandler(function* () {
        started.resolve();
        yield new Promise(() => undefined);

        return { ok: true };
      }),
    );

    const port = await listen(instance);
    const pending = send(port, '/hang');
    await started.promise;
    await createShutdown(instance)({ cancelAfter: 200 });

    expect((await pending).statusCode).toBe(499);
  });

  it('drops a cancellation that surfaces after the client left', async () => {
    const started = deferred();
    const handled = deferred();
    let headersSent: boolean | undefined;

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(function (error, request, reply) {
      cancelErrorHandler().call(this, error, request, reply);
      headersSent = reply.raw.headersSent;
      handled.resolve();
    });
    // request scoped work outside the wrapper: the rejection reaches the error handler, which is
    // the only place left to drop it
    instance.get('/late', async (request, reply) => {
      const signal = getRequestSignal(request, reply);

      started.resolve();
      await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });

      return { ok: true };
    });

    const port = await listen(instance);
    const request = open(port, '/late');

    await started.promise;
    request.destroy();
    await handled.promise;

    expect(headersSent).toBe(false);
    expect(instance.server.listening).toBe(true);
  });

  it('cuts the connection when a cancellation reaches it after the head went out', async () => {
    const started = deferred();

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler());
    // a plain route, so the plugin handler is the only thing between the rejection and the client
    instance.get('/part', async (request, reply) => {
      const signal = getRequestSignal(request, reply);

      reply.raw.writeHead(200, { 'content-type': 'text/plain' });
      reply.raw.write('part1,');
      started.resolve();
      await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });

    const port = await listen(instance);
    const outcome = new Promise<{ body: string; complete: boolean }>((resolve) => {
      const outgoing = http.get({ host: '127.0.0.1', path: '/part', port }, (response) => {
        let body = '';

        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => resolve({ body, complete: response.complete }));
        response.on('error', () => resolve({ body, complete: false }));
        response.on('close', () => resolve({ body, complete: response.complete }));
      });

      outgoing.on('error', () => resolve({ body: '', complete: false }));
    });

    await started.promise;
    const result = await createShutdown(instance)({ cancelAfter: 50 });

    app = undefined;

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect(await outcome).toEqual({ body: 'part1,', complete: false });
  });

  it('logs the cut once at error level when the head already went out', async () => {
    const started = deferred();
    const logged: string[] = [];

    const instance = Fastify({
      logger: {
        level: 'error',
        stream: {
          write(line: string): void {
            logged.push(line);
          },
        },
      },
    });
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler());
    instance.get('/part', async (request, reply) => {
      const signal = getRequestSignal(request, reply);

      reply.raw.writeHead(200, { 'content-type': 'text/plain' });
      reply.raw.write('part1,');
      started.resolve();
      await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });

    const port = await listen(instance);
    const outcome = new Promise<void>((resolve) => {
      const outgoing = http.get({ host: '127.0.0.1', path: '/part', port }, (response) => {
        response.resume();
        response.on('end', () => resolve());
        response.on('error', () => resolve());
        response.on('close', () => resolve());
      });

      outgoing.on('error', () => resolve());
    });

    await started.promise;
    await createShutdown(instance)({ cancelAfter: 50 });
    await outcome;
    await tick();

    app = undefined;

    expect(logged.filter((line) => line.includes('"level":50'))).toHaveLength(1);
  });

  it('passes an ordinary failure through', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler());
    instance.get(
      '/boom',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw new Error('boom');
      }),
    );

    const port = await listen(instance);
    const response = await send(port, '/boom');

    expect(response.statusCode).toBe(500);
  });
});

describe('cancellation after the response ended', () => {
  it('is dropped instead of forwarded', async () => {
    const logged: string[] = [];

    const instance = Fastify({
      logger: {
        level: 'error',
        stream: {
          write(line: string): void {
            logged.push(line);
          },
        },
      },
    });
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler());
    // writing the raw response is what a route streaming its own answer does, and it is what puts
    // the finished response behind the cancellation
    instance.get(
      '/late',
      cancelableHandler(function* (_request, reply) {
        reply.raw.writeHead(200, { 'content-type': 'text/plain' });
        reply.raw.end('answered');
        yield Promise.resolve();

        throw new CancelError(SERVER_SHUTDOWN);
      }),
    );

    const port = await listen(instance);
    const response = await send(port, '/late');
    await tick();

    expect(response).toEqual({ body: 'answered', statusCode: 200 });
    expect(logged).toEqual([]);
  });
});

describe('handler kinds', () => {
  it('answers 500 through the error handler for an async generator handler', async () => {
    const errors: unknown[] = [];
    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler((error, _request, reply) => {
      errors.push(error);
      void reply.code(500).send();
    });
    instance.get('/', cancelableHandler(asyncGeneratorHandler as never));

    const port = await listen(instance);
    const response = await send(port, '/');

    expect(response.statusCode).toBe(500);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TypeError);
  });

  it('skips a handler whose caller signal was already aborted', async () => {
    const handler = jest.fn();
    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler());
    instance.get('/', cancelableHandler(handler, { signal: AbortSignal.abort() }));

    const port = await listen(instance);
    const response = await send(port, '/');

    expect(response.statusCode).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('shutdown cancel status', () => {
  /** Reads the status line off the first bytes a raw connection gets back. */
  async function firstStatus(client: Socket): Promise<number> {
    const [chunk] = await once(client, 'data');

    return Number(/^HTTP\/1\.1 (\d{3})/.exec(String(chunk))?.[1]);
  }

  it('answers 503 for a shutdown cancel that reaches fastify default error handling', async () => {
    const started = deferred();

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.get(
      '/hang',
      cancelableHandler(function* () {
        started.resolve();
        yield new Promise(() => undefined);

        return { ok: true };
      }),
    );

    const port = await listen(instance);
    const pending = send(port, '/hang');
    await started.promise;
    await createShutdown(instance)({ cancelAfter: 200 });

    expect((await pending).statusCode).toBe(503);
  });

  it('takes the handler status over the stamped 503 for a shutdown cancel', async () => {
    const started = deferred();

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler({ status: 502 }));
    instance.get(
      '/hang',
      cancelableHandler(function* () {
        started.resolve();
        yield new Promise(() => undefined);

        return { ok: true };
      }),
    );

    const port = await listen(instance);
    const pending = send(port, '/hang');
    await started.promise;
    await createShutdown(instance)({ cancelAfter: 200 });

    expect((await pending).statusCode).toBe(502);
  });

  it('answers the shutdown status and headers without a handler error handler', async () => {
    const started = deferred();

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.get(
      '/hang',
      cancelableHandler(function* () {
        started.resolve();
        yield new Promise(() => undefined);

        return { ok: true };
      }),
    );

    const port = await listen(instance);
    const pending = sendExchange(port, '/hang');
    await started.promise;
    await createShutdown(instance)({ cancelAfter: 200, headers: { 'Retry-After': '5' }, status: 504 });

    const answer = await pending;

    expect(answer.statusCode).toBe(504);
    expect(answer.headers['retry-after']).toBe('5');
  });

  it('keeps an explicit shutdown status over the handler status', async () => {
    const started = deferred();

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler({ status: 502 }));
    instance.get(
      '/hang',
      cancelableHandler(function* () {
        started.resolve();
        yield new Promise(() => undefined);

        return { ok: true };
      }),
    );

    const port = await listen(instance);
    const pending = send(port, '/hang');
    await started.promise;
    await createShutdown(instance)({ cancelAfter: 200, status: 504 });

    expect((await pending).statusCode).toBe(504);
  });

  it('takes the handler status for a route-signal cancel on a live request', async () => {
    const started = deferred();
    const routeAbort = new AbortController();

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler({ status: 502 }));
    instance.get(
      '/route',
      cancelableHandler(
        function* () {
          started.resolve();
          yield new Promise(() => undefined);

          return { ok: true };
        },
        { signal: routeAbort.signal },
      ),
    );

    const port = await listen(instance);
    const pending = send(port, '/route');
    await started.promise;
    routeAbort.abort();

    expect((await pending).statusCode).toBe(502);
  });

  it('leaves a user timeout that carries no status to fastify', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler({ status: 502 }));
    instance.get(
      '/user-timeout',
      cancelableHandler(function* () {
        throw new CancelError('user timeout', { cause: new TimeoutError('user timeout') });
      }),
    );

    const port = await listen(instance);

    expect((await send(port, '/user-timeout')).statusCode).toBe(500);
  });

  it('keeps a deadline status over the handler status', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler({ status: 502 }));
    instance.get(
      '/slow',
      cancelableHandler(
        function* () {
          yield new Promise(() => undefined);

          return { ok: true };
        },
        { timeout: { ms: 20, status: 504 } },
      ),
    );

    const port = await listen(instance);

    expect((await send(port, '/slow')).statusCode).toBe(504);
  });

  it('gives each in-flight request its own shutdown cancellation', async () => {
    const errors: unknown[] = [];
    const handle = cancelErrorHandler();
    let entered = 0;
    const bothStarted = deferred();

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(function (this: FastifyInstance, error, request, reply) {
      errors.push(error);
      handle.call(this, error, request, reply);
    });
    instance.get(
      '/hang',
      cancelableHandler(function* () {
        entered += 1;
        if (entered === 2) {
          bothStarted.resolve();
        }
        yield new Promise(() => undefined);

        return { ok: true };
      }),
    );

    const port = await listen(instance);
    const pending = [send(port, '/hang'), send(port, '/hang')];

    await bothStarted.promise;
    await createShutdown(instance)({ cancelAfter: 200 });
    await Promise.all(pending);

    expect(errors).toHaveLength(2);
    expect(errors[0]).not.toBe(errors[1]);
  });

  it('answers 503 for a request that arrives during a cancel-on-start drain', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.get(
      '/late',
      cancelableHandler(function* () {
        yield new Promise(() => undefined);

        return { ok: true };
      }),
    );

    const port = await listen(instance);
    // a connection opened before the drain starts is the only way to deliver a request while it runs
    const accepted = once(instance.server, 'connection');
    const client = connect(port, '127.0.0.1');
    sockets.push(client);
    client.on('error', () => {});
    await accepted;

    const shutdown = createShutdown(instance)({ cancelAfter: 0, closeAfter: 500 });
    client.write('GET /late HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');

    expect(await firstStatus(client)).toBe(503);
    await shutdown;
  });

  it('lets a signal-only route answer 503 after the cancel, and counts it canceled', async () => {
    const reached = deferred();
    const events: string[] = [];

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.get('/signal', (request, reply) => {
      getRequestSignal(request, reply).addEventListener('abort', () => {
        setTimeout(() => {
          events.push('answered');
          reply.code(503).send();
        }, 30);
      });
      reached.resolve();
    });

    const port = await listen(instance);
    const pending = send(port, '/signal');
    await reached.promise;

    const shutdown = createShutdown(instance)({ cancelAfter: 50, closeAfter: 2_000 }).then((result) => {
      events.push('resolved');
      return result;
    });

    expect((await pending).statusCode).toBe(503);
    expect(await shutdown).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect(events).toEqual(['answered', 'resolved']);
  });

  it('holds the window for a cleanup that awaits, then answers 503 and counts it canceled', async () => {
    const started = deferred();
    const events: string[] = [];

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.get(
      '/cleanup',
      cancelableHandler(function* () {
        started.resolve();
        try {
          yield new CancelablePromise<void>(() => undefined);

          return { ok: true };
        } finally {
          yield new CancelablePromise<void>((resolve) => setTimeout(resolve, 50));
          events.push('cleaned');
        }
      }),
    );

    const port = await listen(instance);
    const pending = send(port, '/cleanup');
    await started.promise;

    const shutdown = createShutdown(instance)({ cancelAfter: 50, closeAfter: 2_000 }).then((result) => {
      events.push('resolved');
      return result;
    });

    expect((await pending).statusCode).toBe(503);
    expect(await shutdown).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect(events).toEqual(['cleaned', 'resolved']);
  });
});

describe('shutdown', () => {
  it('leaves a plain route error that lands during a shutdown uncounted as canceled', async () => {
    const started = deferred();

    const instance = Fastify();
    // ahead of the plugin hook, so the request has no cancel state until the error path reads it
    instance.addHook('onRequest', () => {
      started.resolve();

      return new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('boom')), 30);
      });
    });
    await instance.register(cancelPlugin);
    const handle = cancelErrorHandler();
    // answers after the shutdown cancel, so the error path reads state the cancel did not reach
    instance.setErrorHandler(function (this: FastifyInstance, error, request, reply) {
      setTimeout(() => handle.call(this, error, request, reply), 150);
    });
    instance.get('/plain', () => ({ ok: true }));

    const port = await listen(instance);
    const shutdown = createShutdown(instance);
    const pending = send(port, '/plain');
    await started.promise;

    const result = await shutdown({ cancelAfter: 60 });

    app = undefined;

    expect(result).toEqual({ canceled: 0, completed: 1, timedOut: false });
    expect((await pending).statusCode).toBe(500);
  });

  it('cancels a hung handler when the grace window ends', async () => {
    const started = deferred();

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler());
    instance.get(
      '/hang',
      cancelableHandler(function* () {
        started.resolve();
        yield new Promise(() => undefined);

        return { ok: true };
      }),
    );

    const port = await listen(instance);
    const pending = send(port, '/hang');
    await started.promise;

    const result = await createShutdown(instance)({ cancelAfter: 200 });

    app = undefined;

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect((await pending).statusCode).toBe(503);
    expect(instance.server.listening).toBe(false);
  });

  it('gives up on a handler that ignores its cancellation', async () => {
    const started = deferred();

    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.get(
      '/shielded',
      cancelableHandler(
        function* () {
          started.resolve();
          yield new Promise(() => undefined);
        },
        // a shielded handler ignores the cancellation a shutdown sends it, which is the case the
        // grace window exists for
        { shield: true },
      ),
    );

    const port = await listen(instance);
    const request = open(port, '/shielded');

    await started.promise;
    const result = await createShutdown(instance)({ cancelAfter: 100 });

    app = undefined;
    request.destroy();

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: true });
  });

  it('tells a request held before the plugin hook to close its connection', async () => {
    const started = deferred();
    const gate = deferred();

    const instance = Fastify();
    // answers ahead of the plugin's own hook, so the request never gains cancel state and only the
    // instance's own record of it can make the shutdown aware of it
    instance.addHook('onRequest', async (_request, reply) => {
      started.resolve();
      await gate.promise;

      return reply.send({ ok: true });
    });
    await instance.register(cancelPlugin);
    instance.get('/plain', () => ({ ok: true }));

    const port = await listen(instance);
    const answer = new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', path: '/plain', port }, (response) => {
          response.resume();
          response.on('end', () => resolve(response.headers));
        })
        .on('error', reject);
    });

    await started.promise;
    const closing = createShutdown(instance)({ cancelAfter: 1000 });

    app = undefined;
    gate.resolve();

    expect((await answer).connection).toBe('close');
    expect(await closing).toEqual({ canceled: 0, completed: 1, timedOut: false });
  });

  it('returns the same result to a second call', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.get(
      '/quick',
      cancelableHandler(function* () {
        return { ok: true };
      }),
    );

    await listen(instance);
    const first = createShutdown(instance)({ cancelAfter: 100 });

    app = undefined;

    expect(createShutdown(instance)()).toBe(first);
    expect(await first).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });

  it('allows a real shutdown after a soft shutdown completes', async () => {
    const instance = Fastify();
    await listen(instance);

    const closeSpy = jest.spyOn(instance, 'close');

    const first = createShutdown(instance)({ closeServer: false });
    await first;

    expect(closeSpy).not.toHaveBeenCalled();
    expect(instance.server.listening).toBe(true);

    const second = createShutdown(instance)();
    expect(second).not.toBe(first);
    await second;
    app = undefined;
    expect(instance.server.listening).toBe(false);
  });

  it('resolves with the outcome when an onClose hook throws', async () => {
    const logged: string[] = [];
    const instance = Fastify({
      logger: {
        level: 'error',
        stream: {
          write(line: string): void {
            logged.push(line);
          },
        },
      },
    });
    instance.addHook('onClose', async () => {
      throw new Error('pool close failed');
    });
    await listen(instance);

    await expect(createShutdown(instance)()).resolves.toEqual({ canceled: 0, completed: 0, timedOut: false });
    expect(logged.filter((line) => line.includes('closing the instance failed'))).toHaveLength(1);
    expect(logged.filter((line) => line.includes('"level":50'))).toHaveLength(1);

    app = undefined;
    expect(instance.server.listening).toBe(false);
  });

  it('attempts close again if the first attempt failed', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const instance = Fastify();
    await listen(instance);

    const originalClose = instance.close.bind(instance);
    instance.close = jest.fn().mockRejectedValueOnce(new Error('close failed')).mockImplementation(originalClose);

    try {
      const first = createShutdown(instance)();
      await first;

      const second = createShutdown(instance)();
      expect(second).not.toBe(first);
      await second;
    } finally {
      errorSpy.mockRestore();
    }

    app = undefined;
    expect(instance.close).toHaveBeenCalledTimes(2);
    expect(instance.server.listening).toBe(false);
  });
});

const STREAMED_CHUNKS = 6;
const STREAMED_BODY = 'chunk\n'.repeat(STREAMED_CHUNKS);

/** A body fastify streams over roughly 300ms after the handler returned, well past a 50ms deadline. */
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

/** A wrapped hook that hands the request straight on, the shape of an auth or tenant check. */
function passThrough(): preHandlerAsyncHookHandler {
  return cancelableHandler(function* () {
    /**/
  }) as unknown as preHandlerAsyncHookHandler;
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

describe('createShutdown argument', () => {
  it('names the argument when given something other than a fastify instance', () => {
    const bad = () => createShutdown(undefined as unknown as FastifyInstance);

    expect(bad).toThrow(TypeError);
    expect(bad).toThrow('createShutdown() needs the fastify instance as its first argument, got undefined.');
  });
});

describeShutdownSockets(createShutdown, async (arrived, release) => {
  const plain = Fastify();
  plain.get('/fast', async () => 'ok');
  plain.get('/slow', async () => {
    arrived();
    await release;

    return 'ok';
  });
  await plain.listen({ host: '127.0.0.1', port: 0 });

  return { server: plain.server, target: plain };
});

describe('optional error handler', () => {
  it('answers a wrapped deadline with the stamped 503 to a user error handler, with no warning', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    const seen: unknown[] = [];
    instance.setErrorHandler((error, _request, reply) => {
      seen.push((error as { statusCode?: number }).statusCode);
      void reply.status((error as { statusCode?: number }).statusCode ?? 500).send('user');
    });
    instance.get(
      '/slow',
      cancelableHandler(
        function* () {
          yield new Promise((resolve) => setTimeout(resolve, 1000));
        },
        { timeout: 40 },
      ),
    );

    const warnings = recordWarnings();
    const port = await listen(instance);
    const response = await send(port, '/slow');
    const found = warnings.stop();

    expect(response).toEqual({ body: 'user', statusCode: 503 });
    expect(seen).toEqual([503]);
    expect(found.filter((line) => line.includes('FSTWRN004'))).toEqual([]);
  });

  it('answers a route-signal cancel with the stamped 503 to a user error handler', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    const seen: unknown[] = [];
    instance.setErrorHandler((error, _request, reply) => {
      seen.push((error as { statusCode?: number }).statusCode);
      void reply.status((error as { statusCode?: number }).statusCode ?? 500).send('user');
    });
    const route = new AbortController();
    instance.get(
      '/route',
      cancelableHandler(
        function* () {
          yield new Promise((resolve) => setTimeout(resolve, 1000));
        },
        { signal: route.signal },
      ),
    );

    const port = await listen(instance);
    const pending = send(port, '/route');
    setTimeout(() => route.abort(), 30);
    const response = await pending;

    expect(response).toEqual({ body: 'user', statusCode: 503 });
    expect(seen).toEqual([503]);
  });

  it('hands a non-cancellation error to onError once, in place of fastify reply.send', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    const seen: unknown[] = [];
    instance.setErrorHandler(
      cancelErrorHandler({
        onError: (error, _request, reply) => {
          seen.push(error);
          void reply.status(429).send('slow down');
        },
      }),
    );
    instance.get(
      '/limited',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw Object.assign(new Error('limited'), { statusCode: 429 });
      }),
    );

    const warnings = recordWarnings();
    const port = await listen(instance);
    const response = await send(port, '/limited');
    const found = warnings.stop();

    expect(response).toEqual({ body: 'slow down', statusCode: 429 });
    expect(seen).toHaveLength(1);
    expect(found.filter((line) => line.includes('FSTWRN004'))).toEqual([]);
  });

  it('keeps a cancellation away from onError and answers its deadline status through fastify', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    const seen: unknown[] = [];
    instance.setErrorHandler(
      cancelErrorHandler({
        onError: (error, _request, reply) => {
          seen.push(error);
          void reply.status(500).send('user');
        },
      }),
    );
    instance.get(
      '/slow',
      cancelableHandler(
        function* () {
          yield new Promise(() => undefined);

          return 'never';
        },
        { timeout: { message: 'route took too long', ms: 20, status: 504 } },
      ),
    );

    const port = await listen(instance);
    const response = await send(port, '/slow');

    expect(response.statusCode).toBe(504);
    expect(seen).toEqual([]);
  });

  it('logs a signal-only late failure once at error level', async () => {
    const logged: string[] = [];
    const instance = Fastify({
      logger: {
        level: 'error',
        stream: {
          write(line: string): void {
            logged.push(line);
          },
        },
      },
    });
    await instance.register(cancelPlugin);
    instance.get(
      '/late',
      cancelableHandler(
        async (request, reply) => {
          const signal = getRequestSignal(request, reply);

          await new Promise<void>((resolve) => {
            signal.addEventListener('abort', () => resolve(), { once: true });
          });

          throw new Error('late boom');
        },
        { timeout: 30 },
      ),
    );

    const port = await listen(instance);
    const response = await send(port, '/late');
    await tick();

    expect(response.statusCode).toBe(503);
    expect(logged.filter((line) => line.includes('"level":50') && line.includes('late boom'))).toHaveLength(1);
  });

  it('logs a wrapped route head cut once at error level', async () => {
    const started = deferred();
    const logged: string[] = [];
    const instance = Fastify({
      logger: {
        level: 'error',
        stream: {
          write(line: string): void {
            logged.push(line);
          },
        },
      },
    });
    await instance.register(cancelPlugin);
    instance.get(
      '/part',
      cancelableHandler(function* (request, reply) {
        const signal = getRequestSignal(request, reply);

        reply.raw.writeHead(200, { 'content-type': 'text/plain' });
        reply.raw.write('part1,');
        started.resolve();
        yield new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }),
    );

    const port = await listen(instance);
    const outcome = new Promise<void>((resolve) => {
      const outgoing = http.get({ host: '127.0.0.1', path: '/part', port }, (response) => {
        response.resume();
        response.on('close', () => resolve());
      });

      outgoing.on('error', () => resolve());
    });

    await started.promise;
    await createShutdown(instance)({ cancelAfter: 50 });
    await outcome;
    await tick();

    app = undefined;

    expect(logged.filter((line) => line.includes('"level":50'))).toHaveLength(1);
  });
});

describe('cancelErrorHandler status range', () => {
  it('throws a RangeError for a status outside 200 to 599 at the factory', () => {
    expect(() => cancelErrorHandler({ status: 199 })).toThrow(RangeError);
    expect(() => cancelErrorHandler({ status: 600 })).toThrow(RangeError);
    expect(() => cancelErrorHandler({ status: 502.5 })).toThrow(RangeError);
    expect(() => cancelErrorHandler({ status: 200 })).not.toThrow();
    expect(() => cancelErrorHandler({ status: 599 })).not.toThrow();
  });
});
