/**
 * Server-family type-level fixture: `@cancjs/server-hono`. Imports the BUILT package (resolved
 * from the installed tarball, never from src) and checks the handler-inference contract it
 * advertises: a bare `function* (c, next)` infers both parameters with no annotations, a plain
 * async handler typechecks alongside the generator form, `Bindings` flows through to `c.env`, a
 * generator returning something other than a `Response` is a compile error, a wrong-arity handler
 * is a compile error, and `drain` rejects the `Hono` application in place of what `serve()`
 * returns.
 *
 * Deliberately runtime-dead (nothing executes); exists purely to make `tsc --noEmit` chew through
 * the shipped declaration files.
 *
 * NOT part of `commonFixtures`. Compiled only in lanes matrix.config.json marks
 * `serverHonoTypes: true`. Not measured against 4.2/4.7/5.0 independently; riding the fastify gate
 * (5.4+) is the conservative choice given hono's own dependency tree also touches Node's stream
 * types the same way express does (see ./server-express-types.ts's header).
 */
import { cancelableHandler, drain } from '@cancjs/server-hono';
import type { HttpBindings } from '@hono/node-server';
import { Hono } from 'hono';

const bareHandler = cancelableHandler(function* (c, next) {
  // no annotation on c above, so this only compiles while contextual inference holds
  const path: string = c.req.path;

  yield next();

  return c.text(path);
});
void bareHandler;

const asyncHandler = cancelableHandler(async (c) => {
  await Promise.resolve();

  return c.text(c.req.method);
});
void asyncHandler;

const bindingsHandler = cancelableHandler<{ Bindings: HttpBindings }>(function* (c) {
  const sent: boolean = c.env.outgoing.headersSent;

  yield Promise.resolve();

  return c.text(String(sent));
});
void bindingsHandler;

const app = new Hono();
app.get(
  '/typed',
  cancelableHandler(function* (c) {
    yield Promise.resolve();

    return c.json({ ok: true });
  }),
);

const wrongReturnHandler = () =>
  cancelableHandler(
    // @ts-expect-error a hono handler answers with a response
    function* () {
      yield Promise.resolve();

      return { ok: true };
    },
  );
void wrongReturnHandler;

const wrongArityHandler = () =>
  cancelableHandler(
    // @ts-expect-error a route handler is called with the context and next, nothing more
    function* (_c, _next, _extra: string) {
      yield Promise.resolve();
    },
  );
void wrongArityHandler;

const badDrain = () =>
  // @ts-expect-error drain takes what serve() returned, never the application itself
  drain(app);
void badDrain;

export {};
