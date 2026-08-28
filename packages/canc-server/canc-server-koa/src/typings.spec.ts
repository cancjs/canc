import { CancelSignal } from '@cancjs/promise';
import type { Server } from 'http';
import Koa, { Context, Middleware } from 'koa';

import { cancelableHandler, cancelMiddleware, drain, getRequestSignal } from './index';

// This suite asserts at compile time. ts-jest reports type errors as test failures, so a signature
// that stops inferring fails the run rather than passing silently.

describe('handler inference', () => {
  it('infers the context of a bare generator handler', () => {
    const handler = cancelableHandler(function* (ctx) {
      // no annotation anywhere above, so this only compiles while inference holds
      const url: string = ctx.url;
      ctx.status = 200;
      ctx.body = url;
    });

    expectHandler(handler);
  });

  it('carries a custom state and context type into the handler', () => {
    const handler = cancelableHandler<{ user: string }, { db: unknown }>(function* (ctx) {
      const user: string = ctx.state.user;
      const db: unknown = ctx.db;

      ctx.body = user;

      return db;
    });

    expectHandler(handler);
  });

  it('accepts a plain handler alongside the generator form', () => {
    const handler = cancelableHandler(async (ctx) => {
      ctx.body = 'ok';
    });

    expectHandler(handler);
  });

  it('rejects a handler expecting more than the context', () => {
    const build = () =>
      // @ts-expect-error a route handler here takes only the context, never next
      cancelableHandler(function* (_ctx, _next) {
        /**/
      });

    expect(build).toBeInstanceOf(Function);
  });
});

describe('cancel middleware', () => {
  it('is assignable wherever koa expects a middleware', () => {
    const app = new Koa();
    const middleware: Middleware = cancelMiddleware();

    expect(() => app.use(middleware)).not.toThrow();
  });
});

describe('other exports', () => {
  it('takes the raw context for the signal', () => {
    const ctx = {} as Context;
    // the annotated return type is the assertion: a bare context reaches the signal without a cast
    const read = (): CancelSignal => getRequestSignal(ctx);

    expect(read).toBeInstanceOf(Function);
  });

  it('drains the http server and not the koa application', () => {
    const server = {} as Server;
    const app = {} as Koa;
    const good = () => drain(server);
    const bad = () =>
      // @ts-expect-error a drain needs the http server, which is what app.listen() hands back
      drain(app);

    expect(good).toBeInstanceOf(Function);
    expect(bad).toBeInstanceOf(Function);
  });
});

function expectHandler(handler: (ctx: any) => Promise<void>): void {
  expect(typeof handler).toBe('function');
}
