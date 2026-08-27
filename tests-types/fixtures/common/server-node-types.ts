/**
 * Server-family type-level fixture: `@cancjs/server-node`. Imports the BUILT package (resolved
 * from the installed tarball, never from src) and checks the handler-inference contract it
 * advertises: a bare `function* (req, res)` infers both parameters with no annotations, a plain
 * async handler typechecks alongside the generator form, a wrong-arity handler is a compile
 * error, `getRequestSignal` takes the raw request/response with no cast, and `drain` takes the
 * raw `http.Server`.
 *
 * Deliberately runtime-dead (nothing executes); exists purely to make `tsc --noEmit` chew through
 * the shipped declaration files.
 *
 * NOT part of `commonFixtures`. Compiled only in lanes matrix.config.json marks
 * `serverExpressTypes: true` (5.0 and newer), the same gate as ./server-express-types.ts: this
 * file's own surface is raw `node:http`, but it sits in the same fixture project as the express
 * and fastify files and the isolated per-lane `node_modules` is shared, so there is nothing to
 * gain by giving it a separate, lower floor.
 */
import { cancelableHandler, drain, getRequestSignal } from '@cancjs/server-node';
import type { IncomingMessage, Server, ServerResponse } from 'http';

const bareHandler = cancelableHandler(function* (req, res) {
  // no annotation on req/res above, so these two only compile while contextual inference holds
  const url: string | undefined = req.url;
  res.end(url);
});
void bareHandler;

const asyncHandler = cancelableHandler(async (_req, res) => {
  res.end('ok');
});
void asyncHandler;

const wrongArityHandler = () =>
  // @ts-expect-error a node request listener takes two arguments, so a third cannot be inferred
  cancelableHandler(function* (_req, _res, _extra) {
    /**/
  });
void wrongArityHandler;

const req = {} as IncomingMessage;
const res = {} as ServerResponse;
const readSignal = (): ReturnType<typeof getRequestSignal> => getRequestSignal(req, res);
void readSignal;

const server = {} as Server;
const goodDrain = () => drain(server);
void goodDrain;

export {};
