/**
 * Server-family type-level fixture: `@cancjs/server-fastify`. Imports the BUILT package
 * (resolved from the installed tarball, never from src) and checks the handler-inference
 * contract it advertises: a bare `function* (request, reply)` infers both parameters with no
 * annotations, a plain async handler typechecks alongside the generator form, a handler may return a
 * `Readable` stream as its reply, `RouteGeneric['Reply']` constrains the generator return, a
 * wrong-arity handler is a compile error, and `createShutdown(app.server)` does not compile
 * because the factory is narrowed to the instance so `onClose` hooks run after the shutdown rather than during it.
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
import { cancelableHandler, cancelableHook, cancelablePreParsing, createShutdown } from '@cancjs/server-fastify';
import Fastify from 'fastify';
import { Readable } from 'node:stream';

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

const streamHandler = cancelableHandler(function* () {
  yield Promise.resolve();

  return Readable.from(['ok']);
});
void streamHandler;

const plainStreamHandler = cancelableHandler(() => Readable.from(['ok']));
void plainStreamHandler;

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

const asyncGeneratorHandler = () =>
  // @ts-expect-error an async generator handler is never drained, so it is rejected at the call site
  cancelableHandler(async function* () {
    yield 1;
  });
void asyncGeneratorHandler;

const wrongArityHandler = () =>
  // @ts-expect-error a route handler is called with the request and the reply, nothing more
  cancelableHandler(function* (_request, _reply, _extra: string) {
    yield Promise.resolve();
  });
void wrongArityHandler;

const requestHook = cancelableHook(function* (request, reply) {
  const method: string = request.method;
  const ended: boolean = reply.raw.writableEnded;
  yield Promise.resolve();
  void method;
  void ended;
});
void requestHook;

const typedHook = cancelableHook<{ Params: { id: string } }>(function* (request) {
  const id: string = request.params.id;
  yield Promise.resolve();
  void id;
});
void typedHook;

const parsingHook = cancelablePreParsing(function* (_request, _reply, payload) {
  const pipe: typeof payload.pipe = payload.pipe;
  yield Promise.resolve();
  void pipe;
});
void parsingHook;

const asyncGeneratorHook = () =>
  // @ts-expect-error async generators are not supported by a request hook
  cancelableHook(async function* () {
    yield 1;
  });
void asyncGeneratorHook;

const wrongArityHook = () =>
  // @ts-expect-error request hooks take only request and reply
  cancelableHook(function* (_request, _reply, _payload: string) {
    yield Promise.resolve();
  });
void wrongArityHook;

const app = Fastify();
app.addHook('onRequest', requestHook);
app.addHook('preValidation', requestHook);
app.addHook('preHandler', requestHook);
app.addHook('preParsing', parsingHook);
app.get<{ Params: { id: string } }>('/users/:id', { preHandler: typedHook }, () => 'ok');
// @ts-expect-error onRequestAbort does not accept a request/reply hook
app.addHook('onRequestAbort', requestHook);
const goodShutdown = () => createShutdown(app);
const badShutdown = () =>
  // @ts-expect-error the shutdown is narrowed to the instance so onClose hooks run after it
  createShutdown(app.server);
void goodShutdown;
void badShutdown;

export {};
