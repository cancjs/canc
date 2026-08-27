import type { HttpBindings } from '@hono/node-server';
import { Hono } from 'hono';

import { cancelableHandler, drain } from './index';

// compile-time coverage: under strict mode a parameter the contextual type failed to reach is an
// implicit any, so these cases fail the build rather than an assertion
describe('handler typing', () => {
  it('infers both parameters of a bare generator handler', () => {
    const handler = cancelableHandler(function* (c, next) {
      const path: string = c.req.path;

      yield next();

      return c.text(path);
    });

    expect(typeof handler).toBe('function');
  });

  it('infers both parameters of a plain async handler', () => {
    const handler = cancelableHandler(async (c) => {
      await Promise.resolve();

      return c.text(c.req.method);
    });

    expect(typeof handler).toBe('function');
  });

  it('carries the bindings through to the context', () => {
    const handler = cancelableHandler<{ Bindings: HttpBindings }>(function* (c) {
      const sent: boolean = c.env.outgoing.headersSent;

      yield Promise.resolve();

      return c.text(String(sent));
    });

    expect(typeof handler).toBe('function');
  });

  it('mounts on a route', () => {
    const app = new Hono();

    app.get(
      '/typed',
      cancelableHandler(function* (c) {
        yield Promise.resolve();

        return c.json({ ok: true });
      }),
    );

    expect(app.routes).toHaveLength(1);
  });

  it('rejects a generator returning something other than a response', () => {
    const handler = cancelableHandler(
      // @ts-expect-error a hono handler answers with a response
      function* () {
        yield Promise.resolve();

        return { ok: true };
      },
    );

    expect(typeof handler).toBe('function');
  });

  it('rejects a handler taking more than the context and next', () => {
    const handler = cancelableHandler(
      // @ts-expect-error a route handler is called with the context and next, nothing more
      function* (_c, _next, _extra: string) {
        yield Promise.resolve();
      },
    );

    expect(typeof handler).toBe('function');
  });
});

describe('drain typing', () => {
  it('rejects the application in place of the server', () => {
    const app = new Hono();

    // @ts-expect-error drain takes what serve() returned, never the application itself
    const pending = drain(app);

    expect(pending).toBeDefined();
  });
});
