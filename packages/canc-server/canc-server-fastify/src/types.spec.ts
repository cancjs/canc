import Fastify from 'fastify';

import {
  cancelableHandler,
  cancelableHook,
  cancelablePlugin,
  cancelablePreParsing,
  cancelErrorHandler,
  createShutdown,
} from './index';

// compile-time coverage: under strict mode a parameter the contextual type failed to reach is an
// implicit any, so these cases fail the build rather than an assertion
describe('handler typing', () => {
  it('infers both parameters of a bare generator handler', () => {
    const handler = cancelableHandler(function* (request, reply) {
      const method: string = request.method;
      const ended: boolean = reply.raw.writableEnded;

      yield Promise.resolve();

      return { ended, method };
    });

    expect(typeof handler).toBe('function');
  });

  it('infers both parameters of a plain async handler', () => {
    const handler = cancelableHandler(async (request, reply) => {
      reply.header('x-request-id', request.id);

      return { ok: true };
    });

    expect(typeof handler).toBe('function');
  });

  it('constrains the generator return through the route reply type', () => {
    const handler = cancelableHandler<{ Reply: { ok: boolean } }>(function* () {
      yield Promise.resolve();

      return { ok: true };
    });

    expect(typeof handler).toBe('function');
  });

  it('rejects a return the route reply type does not allow', () => {
    // @ts-expect-error the route reply type says ok is a boolean
    const handler = cancelableHandler<{ Reply: { ok: boolean } }>(function* () {
      yield Promise.resolve();

      return { ok: 'yes' };
    });

    expect(typeof handler).toBe('function');
  });

  it('rejects a handler taking more than the request and the reply', () => {
    // @ts-expect-error a route handler is called with the request and the reply, nothing more
    const handler = cancelableHandler(function* (_request, _reply, _extra: string) {
      yield Promise.resolve();
    });

    expect(typeof handler).toBe('function');
  });
});

describe('createShutdown typing', () => {
  it('takes the instance and not the raw server', async () => {
    const instance = Fastify();

    // @ts-expect-error the shutdown is narrowed to the instance so onClose hooks run after it
    const wrong = () => createShutdown(instance.server);

    expect(typeof wrong).toBe('function');
    await instance.close();
  });
});

describe('hook typing', () => {
  it('infers request and reply and mounts one hook on three request stages', async () => {
    const instance = Fastify();
    const hook = cancelableHook(function* (request, reply) {
      const method: string = request.method;
      const ended: boolean = reply.raw.writableEnded;
      yield Promise.resolve();
      void method;
      void ended;
    });

    instance.addHook('onRequest', hook);
    instance.addHook('preValidation', hook);
    instance.addHook('preHandler', hook);

    expect(typeof hook).toBe('function');
    await instance.close();
  });

  it('preserves the route generic and the preParsing payload stream', async () => {
    const instance = Fastify();
    const routeHook = cancelableHook<{ Params: { id: string } }>(function* (request) {
      const id: string = request.params.id;
      yield Promise.resolve();
      void id;
    });
    instance.get<{ Params: { id: string } }>('/users/:id', { preHandler: routeHook }, () => 'ok');
    const parser = cancelablePreParsing(function* (_request, _reply, payload) {
      const pipe: typeof payload.pipe = payload.pipe;
      yield Promise.resolve();
      void pipe;
    });

    instance.addHook('preParsing', parser);

    expect(typeof parser).toBe('function');
    await instance.close();
  });

  it('rejects incompatible hooks', () => {
    const instance = Fastify();
    instance.addHook(
      'onRequestAbort',
      // @ts-expect-error onRequestAbort has no reply and cannot use the wrapper
      cancelableHook(function* () {
        yield Promise.resolve();
      }),
    );
    // @ts-expect-error an async generator cannot be drained as a request hook
    const asyncHook = cancelableHook(async function* () {
      yield 1;
    });
    // @ts-expect-error a request hook accepts only request and reply
    const extraHook = cancelableHook(function* (_request, _reply, _payload: string) {
      yield Promise.resolve();
    });

    expect(typeof asyncHook).toBe('function');
    expect(typeof extraHook).toBe('function');
  });
});

describe('cancelable plugin typing', () => {
  it('infers an instance and options and registers a generator plugin', async () => {
    const instance = Fastify();
    instance.register(
      cancelablePlugin(function* (pluginInstance, opts) {
        const name: string = pluginInstance.prefix;
        void opts;
        yield Promise.resolve();
        void name;
      }),
    );
    instance.register(
      cancelablePlugin<{ url: string }>(function* (_pluginInstance, opts) {
        const url: string = opts.url;
        yield Promise.resolve();
        void url;
      }),
      { url: 'x' },
    );

    await instance.ready();
    await instance.close();
  });

  it('rejects async generators and wrong plugin options', () => {
    const wrongPlugin = () =>
      // @ts-expect-error async generators are not drained during plugin boot
      cancelablePlugin(async function* () {
        yield 1;
      });
    const instance = Fastify();
    const badOptions = () =>
      instance.register(
        cancelablePlugin<{ url: string }>(function* () {
          yield Promise.resolve();
        }),
        // @ts-expect-error plugin options require url to be a string
        { url: 1 },
      );
    expect(typeof wrongPlugin).toBe('function');
    expect(typeof badOptions).toBe('function');
  });
});

describe('cancelErrorHandler typing', () => {
  it('accepts synchronous and asynchronous response mappers in the native error slot', async () => {
    const instance = Fastify();

    instance.setErrorHandler(
      cancelErrorHandler({
        onError: (_error, request, reply) => {
          reply.header('x-request-id', request.id);

          return { marker: request.method };
        },
      }),
    );
    instance.setErrorHandler(
      cancelErrorHandler({
        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- prove the existing void-compatible API accepts a returned promise
        onError: (_error, request) => Promise.resolve({ marker: request.method }),
      }),
    );

    await instance.close();
  });

  it('rejects an incompatible mapper parameter', () => {
    const handler = cancelErrorHandler({
      // @ts-expect-error the request parameter is a FastifyRequest, not a string
      onError: (_error, _request: string) => ({ marker: 'wrong' }),
    });

    expect(typeof handler).toBe('function');
  });
});
