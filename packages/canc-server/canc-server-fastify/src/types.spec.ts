import Fastify from 'fastify';

import { cancelableHandler, shutdown } from './index';

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

describe('shutdown typing', () => {
  it('takes the instance and not the raw server', async () => {
    const instance = Fastify();

    // @ts-expect-error the shutdown is narrowed to the instance so onClose hooks run after it
    const wrong = () => shutdown(instance.server);

    expect(typeof wrong).toBe('function');
    await instance.close();
  });
});
