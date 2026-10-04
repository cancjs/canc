/**
 * Server-family type-level fixture: `@cancjs/server-fastify`. Imports the BUILT package
 * (resolved from the installed tarball, never from src) and checks the handler-inference
 * contract it advertises: a bare `function* (request, reply)` infers both parameters with no
 * annotations, a plain async handler typechecks alongside the generator form, `RouteGeneric
 * ['Reply']` constrains the generator return, a wrong-arity handler is a compile error, and
 * `shutdown(app.server)` does not compile because the wrapper is narrowed to the instance so
 * `onClose` hooks run after the shutdown rather than during it.
 *
 * Deliberately runtime-dead (nothing executes); exists purely to make `tsc --noEmit` chew through
 * the shipped declaration files.
 *
 * NOT part of `commonFixtures`, unlike ./server-express-types.ts. Fastify's own shipped `.d.ts`
 * (`node_modules/fastify/types/route.d.ts`) uses the `NoInfer` utility type, added to `lib.es5
 * .d.ts` in TypeScript 5.4, and fails to parse below that (`Cannot find name 'NoInfer'` on 5.0,
 * plus outright syntax errors on 4.2/4.7 from the same file's newer generic constraint syntax).
 * That is a real floor on fastify itself, not a defect in what this package ships: measured, our
 * own downlevel `dist/types-ts4.2` still imports straight from `'fastify'`, so a TS 4.2 consumer
 * hits the identical wall with or without this package in the middle. This file is compiled only
 * in lanes matrix.config.json marks `serverFastifyTypes: true` (5.4 and newer).
 */
import { cancelableHandler, shutdown } from '@cancjs/server-fastify';
import Fastify from 'fastify';

const bareHandler = cancelableHandler(function* (request, reply) {
  const method: string = request.method;
  const ended: boolean = reply.raw.writableEnded;

  yield Promise.resolve();

  return { ended, method };
});
void bareHandler;

const asyncHandler = cancelableHandler(async (request, reply) => {
  reply.header('x-request-id', request.id);

  return { ok: true };
});
void asyncHandler;

const constrainedHandler = cancelableHandler<{ Reply: { ok: boolean } }>(function* () {
  yield Promise.resolve();

  return { ok: true };
});
void constrainedHandler;

const wrongReturnHandler = () =>
  // @ts-expect-error the route reply type says ok is a boolean
  cancelableHandler<{ Reply: { ok: boolean } }>(function* () {
    yield Promise.resolve();

    return { ok: 'yes' };
  });
void wrongReturnHandler;

const wrongArityHandler = () =>
  // @ts-expect-error a route handler is called with the request and the reply, nothing more
  cancelableHandler(function* (_request, _reply, _extra: string) {
    yield Promise.resolve();
  });
void wrongArityHandler;

const app = Fastify();
const goodShutdown = () => shutdown(app);
const badShutdown = () =>
  // @ts-expect-error the shutdown is narrowed to the instance so onClose hooks run after it
  shutdown(app.server);
void goodShutdown;
void badShutdown;

export {};
