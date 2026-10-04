/**
 * Server-family type-level fixture: `@cancjs/server-koa`. Imports the BUILT package (resolved
 * from the installed tarball, never from src) and checks the handler-inference contract it
 * advertises: a bare `function* (ctx)` infers the context with no annotation, a custom state and
 * context type flow through to `ctx.state` / `ctx.db`, a plain async handler typechecks alongside
 * the generator form, a wrong-arity handler is a compile error (koa handlers take only the
 * context, never `next`), `cancelMiddleware` is assignable wherever koa expects a `Middleware`,
 * `getRequestSignal` takes the raw context without a cast, and `drain` rejects the koa
 * application in place of what `app.listen()` returns.
 *
 * Deliberately runtime-dead (nothing executes); exists purely to make `tsc --noEmit` chew through
 * the shipped declaration files.
 *
 * NOT part of `commonFixtures`. Compiled only in lanes matrix.config.json marks
 * `serverKoaTypes: true`. Koa's own shipped types pull in only `http` / `http2`, never
 * `@types/node`'s `stream/web.d.ts`, so none of the recursive-type or `NoInfer` floors the other
 * families hit apply here; the gate is set on every lane for consistency with the rest of this
 * file's siblings rather than because koa demands one.
 */
import { cancelableHandler, cancelMiddleware, drain, getRequestSignal } from '@cancjs/server-koa';
import type { Server } from 'http';
import Koa, { Context, Middleware } from 'koa';

const bareHandler = cancelableHandler(function* (ctx) {
  // no annotation on ctx above, so this only compiles while contextual inference holds
  const url: string = ctx.url;
  ctx.status = 200;
  ctx.body = url;
});
void bareHandler;

const statefulHandler = cancelableHandler<{ user: string }, { db: unknown }>(function* (ctx) {
  const user: string = ctx.state.user;
  const db: unknown = ctx.db;

  ctx.body = user;

  return db;
});
void statefulHandler;

const asyncHandler = cancelableHandler(async (ctx) => {
  ctx.body = 'ok';
});
void asyncHandler;

const wrongArityHandler = () =>
  cancelableHandler(
    // @ts-expect-error a koa handler is called with only the context, never next
    function* (_ctx, _next) {
      /**/
    },
  );
void wrongArityHandler;

const app = new Koa();
const middleware: Middleware = cancelMiddleware();
app.use(middleware);

const ctx = {} as Context;
// the annotated return type is the assertion: a bare context reaches the signal without a cast
const readSignal = (): ReturnType<typeof getRequestSignal> => getRequestSignal(ctx);
void readSignal;

const server = {} as Server;
const goodDrain = () => drain(server);
const badDrain = () =>
  // @ts-expect-error a drain needs the http server, which is what app.listen() hands back
  drain(app);
void goodDrain;
void badDrain;

export {};
