/**
 * Server-family type-level fixture: `@cancjs/server-express`. Imports the BUILT package
 * (resolved from the installed tarball, never from src) and checks the handler-inference
 * contract it advertises: a bare `function* (req, res)` infers both parameters with no
 * annotations, `ReqBody` / `ReqQuery` / route params flow through, a plain async handler
 * typechecks alongside the generator form, a wrong-arity handler is a compile error, and
 * `getRequestSignal` takes a request/response carrying its own generics without a cast.
 *
 * Deliberately runtime-dead (nothing executes); exists purely to make `tsc --noEmit` chew through
 * the shipped declaration files.
 *
 * NOT part of `commonFixtures`. Compiled only in lanes matrix.config.json marks
 * `serverExpressTypes: true` (5.0 and newer). Express's own package is fine at the TS 4.2 floor
 * the other always-on common fixtures hold to, but `Request`/`Response` pull in @types/node's
 * `stream/web.d.ts` through `@types/express-serve-static-core`, and that file hits a real
 * TypeScript recursive-type limitation on 4.2/4.7 (`'ReadableByteStreamController' is referenced
 * directly or indirectly in its own type annotation`), fixed only at 5.0+, independent of which
 * @types/node version is installed.
 *
 * `@cancjs/server-fastify` has the same shape of coverage in ./server-fastify-types.ts, gated one
 * lane later (5.4+, fastify's own extra floor). `@cancjs/server-node`, `@cancjs/server-koa` and
 * `@cancjs/server-hono` are not shipped yet; they join here once their packages exist.
 */
import { cancelableHandler, drain, getRequestSignal } from '@cancjs/server-express';
import type { Express, Request, Response } from 'express';
import type { ParamsDictionary, Query } from 'express-serve-static-core';
import type { Server } from 'http';

const bareHandler = cancelableHandler(function* (req, res) {
  // no annotation on req/res above, so these two only compile while contextual inference holds
  const url: string = req.url;
  res.status(200).send(url);
});
void bareHandler;

const typedHandler = cancelableHandler<ParamsDictionary, { total: number }, { value: string }, { page: string }>(
  function* (req, res) {
    const value: string = req.body.value;
    const page: string = req.query.page;

    res.json({ total: value.length + page.length });
  },
);
void typedHandler;

const paramsHandler = cancelableHandler<{ id: string }>(function* (req, res) {
  const id: string = req.params.id;

  res.send(id);
});
void paramsHandler;

const asyncHandler = cancelableHandler(async (_req, res) => {
  res.send('ok');
});
void asyncHandler;

const wrongArityHandler = () =>
  // @ts-expect-error express passes three arguments, so a fourth cannot be inferred
  cancelableHandler(function* (_req, _res, _next, _extra) {
    /**/
  });
void wrongArityHandler;

const req = {} as Request<{ id: string }, unknown, { value: string }>;
const res = {} as Response<unknown>;
// the annotated return type is the assertion: a request carrying its own parameter, body and
// query types still reaches the signal without a cast
const readSignal = (): ReturnType<typeof getRequestSignal> => getRequestSignal(req, res);
void readSignal;

const server = {} as Server;
const app = {} as Express;
const goodDrain = () => drain(server);
const badDrain = () =>
  // @ts-expect-error a drain needs the http server, which is what app.listen() hands back
  drain(app);
void goodDrain;
void badDrain;

export {};
