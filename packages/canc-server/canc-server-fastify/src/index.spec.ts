import { once } from 'node:events';
import http from 'node:http';
import { AddressInfo, connect, Socket } from 'node:net';
import { Readable } from 'node:stream';
import { runInThisContext } from 'node:vm';

import { CancelError, isCancelError, isCancelSignal } from '@cancjs/promise';
import Fastify, { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';

import {
  cancelableHandler,
  cancelErrorHandler,
  cancelPlugin,
  getRequestSignal,
  SERVER_SHUTDOWN,
  shutdown,
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

describe('request deadline', () => {
  it('covers a plain route from the moment the plugin is registered', async () => {
    const timeouts: CancelError[] = [];

    const instance = Fastify();
    await instance.register(cancelPlugin, { onTimeout: (reason) => timeouts.push(reason), timeout: 50 });
    instance.get('/plain', (request, reply) => untilAborted(getRequestSignal(request, reply)));

    const port = await listen(instance);
    const outcome = JSON.parse((await send(port, '/plain')).body) as IAbortOutcome;

    expect(outcome.aborted).toBe(true);
    expect(outcome.ms).toBeGreaterThanOrEqual(40);
    expect(outcome.ms).toBeLessThan(ABORT_FALLBACK_MS);
    expect(timeouts).toHaveLength(1);
  });

  it('restarts from a route timeout behind a wrapped hook', async () => {
    let started = 0;

    const instance = Fastify();
    await instance.register(cancelPlugin, { timeout: 50 });
    instance.get(
      '/slow',
      { preHandler: passThrough() },
      cancelableHandler(
        function* () {
          started = performance.now();
          yield new Promise(() => undefined);

          return { ok: true };
        },
        { timeout: 200 },
      ),
    );

    const port = await listen(instance);
    const response = await send(port, '/slow');

    expect(response.statusCode).toBe(503);
    expect(performance.now() - started).toBeGreaterThanOrEqual(190);
  });

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

  it('keeps one close listener on the response across twelve wrapped layers', async () => {
    const warnings = recordWarnings();
    let closeListeners = -1;

    const instance = Fastify();
    // read at finish: every layer has registered whatever it registers by then, none removed yet
    instance.addHook('onRequest', (_request, reply, done) => {
      reply.raw.on('finish', () => {
        closeListeners = reply.raw.listenerCount('close');
      });
      done();
    });
    instance.get(
      '/deep',
      { preHandler: Array.from({ length: 11 }, () => passThrough()) },
      cancelableHandler(function* () {
        return 'ok';
      }),
    );

    const port = await listen(instance);

    expect((await send(port, '/deep')).body).toBe('ok');
    await tick(5);
    expect(closeListeners).toBeLessThanOrEqual(2);
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

  it('answers a cancellation with the configured status', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler({ status: 499 }));
    instance.get(
      '/give-up',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw new CancelError('gave up');
      }),
    );

    const port = await listen(instance);
    const response = await send(port, '/give-up');

    expect(response.statusCode).toBe(499);
  });

  it('still reads the deprecated canceledStatus key', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler({ canceledStatus: 498 }));
    instance.get(
      '/give-up',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw new CancelError('gave up');
      }),
    );

    const port = await listen(instance);
    const response = await send(port, '/give-up');

    expect(response.statusCode).toBe(498);
  });

  it('prefers status over the deprecated canceledStatus key', async () => {
    const instance = Fastify();
    await instance.register(cancelPlugin);
    instance.setErrorHandler(cancelErrorHandler({ status: 499, canceledStatus: 498 }));
    instance.get(
      '/give-up',
      cancelableHandler(function* () {
        yield Promise.resolve();

        throw new CancelError('gave up');
      }),
    );

    const port = await listen(instance);
    const response = await send(port, '/give-up');

    expect(response.statusCode).toBe(499);
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

describe('shutdown', () => {
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
    // the shutdown kills the connection on its way out, so this one is never read back
    send(port, '/hang').catch(() => undefined);
    await started.promise;

    const result = await shutdown(instance, { timeout: 5000 });

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
        // a shielded handler ignores the cancellation a shutdown sends it, which is the case the
        // grace window exists for
        { shield: true },
      ),
    );

    const port = await listen(instance);
    const request = open(port, '/shielded');

    await started.promise;
    const result = await shutdown(instance, { timeout: 100 });

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
    const first = shutdown(instance, { timeout: 100 });

    app = undefined;

    expect(shutdown(instance)).toBe(first);
    expect(await first).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });

  it('allows a real shutdown after a soft shutdown completes', async () => {
    const instance = Fastify();
    await listen(instance);

    const closeSpy = jest.spyOn(instance, 'close');

    const first = shutdown(instance, { closeServer: false });
    await first;

    expect(closeSpy).not.toHaveBeenCalled();
    expect(instance.server.listening).toBe(true);

    const second = shutdown(instance);
    expect(second).not.toBe(first);
    await second;
    app = undefined;
    expect(instance.server.listening).toBe(false);
  });

  it('resolves with the outcome when an onClose hook throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const instance = Fastify();
    instance.addHook('onClose', async () => {
      throw new Error('pool close failed');
    });
    await listen(instance);

    try {
      await expect(shutdown(instance)).resolves.toEqual({ canceled: 0, completed: 0, timedOut: false });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[@cancjs/server-fastify]'), expect.any(Error));
    } finally {
      errorSpy.mockRestore();
    }

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
      const first = shutdown(instance);
      await first;

      const second = shutdown(instance);
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

/** How long a plain route waits for its signal before answering that it never aborted. */
const ABORT_FALLBACK_MS = 1000;

interface IAbortOutcome {
  aborted: boolean;
  ms: number;
}

/** Waits for a signal to abort, or gives up after the fallback window, and reports which and when. */
function untilAborted(signal: AbortSignal): Promise<IAbortOutcome> {
  const started = performance.now();

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(fallback);
      resolve({ aborted: signal.aborted, ms: performance.now() - started });
    };
    const fallback = setTimeout(finish, ABORT_FALLBACK_MS);

    signal.addEventListener('abort', finish, { once: true });
  });
}

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
