import http from 'node:http';
import { AddressInfo } from 'node:net';

import { CancelError, isCancelError } from '@cancjs/promise';
import Fastify, { FastifyInstance } from 'fastify';

import { cancelableHandler, cancelErrorHandler, cancelPlugin, drain, getRequestSignal } from './index';

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

afterEach(async () => {
  const instance = app;

  app = undefined;

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
});
