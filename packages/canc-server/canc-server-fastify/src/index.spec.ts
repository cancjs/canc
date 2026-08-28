import { once } from 'node:events';
import http from 'node:http';
import { AddressInfo, connect, Socket } from 'node:net';

import { CancelError, isCancelError, isCancelSignal } from '@cancjs/promise';
import Fastify, { FastifyInstance } from 'fastify';

import { cancelableHandler, cancelErrorHandler, cancelPlugin, drain, getRequestSignal, SERVER_SHUTDOWN } from './index';

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
    instance.get(
      '/give-up',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw new CancelError('gave up');
      }),
    );

    const port = await listen(instance);
    const response = await send(port, '/give-up');

    expect(response.statusCode).toBe(503);
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

describe('drain', () => {
  it('cancels a hung handler instead of waiting for it', async () => {
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
    // the drain kills the connection on its way out, so this one is never read back
    send(port, '/hang').catch(() => undefined);
    await started.promise;

    const result = await drain(instance, { timeout: 5000 });

    app = undefined;

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
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
        // a shielded handler ignores the cancellation a drain sends it, which is the case the
        // grace window exists for
        { shield: true },
      ),
    );

    const port = await listen(instance);
    const request = open(port, '/shielded');

    await started.promise;
    const result = await drain(instance, { timeout: 100 });

    app = undefined;
    request.destroy();

    expect(result).toEqual({ canceled: 0, completed: 0, timedOut: true });
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
    const first = drain(instance, { timeout: 100 });

    app = undefined;

    expect(drain(instance)).toBe(first);
    expect(await first).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });
});
