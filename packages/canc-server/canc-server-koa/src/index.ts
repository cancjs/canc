import { CancelSignal, isCancelError } from '@cancjs/promise';
import type { Server } from 'http';
import type { Context, DefaultContext, DefaultState, Middleware, ParameterizedContext } from 'koa';

import { drainServer } from '../../../_server/drain';
import { isUnanswerable, statusOf, toRequestLike, toResponseLike } from '../../../_server/exchange';
import { ensureRequestCancelState, getNodeRequestSignal } from '../../../_server/node-signal';
import { runCancelableHandler } from '../../../_server/run';
import { DEFAULT_TIMEOUT_STATUS } from '../../../_server/timeout';
import {
  ICancelableHandlerOptions,
  IDrainOptions,
  IDrainResult,
  IRequestLike,
  IResponseLike,
  THandlerFn,
} from '../../../_server/types';
import { TAnyFn } from '../../../_util';

export { CLIENT_DISCONNECTED, HANDLER_TIMEOUT, SERVER_SHUTDOWN } from '../../../_server/reasons';
export type { ICancelableHandlerOptions, IDrainOptions, IDrainResult } from '../../../_server/types';

/**
 * Wraps a route handler so its work stops when the request does.
 *
 * A generator handler is driven as a coroutine and unwinds at its next `yield`, so `finally` blocks
 * run and downstream work never starts. Any other handler runs signal-only: the request signal still
 * fires and a cancelable promise the handler returns is canceled, but a plain `async` body has no
 * suspension points and runs to completion. Both flavors keep koa's normal context typing, including
 * a bare `function* (ctx)` with no annotations.
 *
 * Koa has no error-middleware arity to detect, so a cancellation this cannot answer is dropped in
 * place: `ctx.respond` is set to `false` and nothing is written to the dead socket. Anything else is
 * rethrown, so it reaches whatever `await next()` sits above this in the stack, `cancelMiddleware`
 * included. That is the whole reason this family exposes no separate `cancelErrorHandler` for koa.
 */
export function cancelableHandler<StateT = DefaultState, ContextT = DefaultContext, ResponseBodyT = unknown>(
  handler: THandlerFn<(ctx: ParameterizedContext<StateT, ContextT, ResponseBodyT>) => any>,
  options?: ICancelableHandlerOptions,
): (ctx: ParameterizedContext<StateT, ContextT, ResponseBodyT>) => Promise<void> {
  return async function cancelableRoute(ctx) {
    const task = runCancelableHandler(handler as TAnyFn, toRequestLike(ctx.req), toResponseLike(ctx.res), options, {
      args: [ctx],
    });

    try {
      await task;
    } catch (error) {
      if (isUnanswerable(error, ctx.res)) {
        // koa would otherwise write its own default body to a response nobody can read
        ctx.respond = false;

        return;
      }

      throw error;
    }
  };
}

/**
 * The cancel signal for a request, installed and wired on first use and cached for every later
 * caller. Request-scoped work started outside a route, a database context or a job handle, takes the
 * same signal and stops with the same cancellation instead of wiring a second listener.
 */
export function getRequestSignal(ctx: Context): CancelSignal {
  return getNodeRequestSignal(ctx.req as IRequestLike, ctx.res as unknown as IResponseLike);
}

/**
 * Installs the request signal up front and answers any cancellation a downstream handler leaves
 * unhandled. Mount it first: koa has no dedicated error-middleware slot, an `await next()` wrapped in
 * a `try`/`catch` is what an error handler looks like here, so this single middleware does both jobs
 * and the family exposes no separate `cancelErrorHandler` for koa the way it does for the others.
 *
 * A deadline answers with the status stamped on it (`503` unless the timeout option names another
 * one), a shutdown cancellation with the fallback status, and a response that can no longer be
 * answered gets nothing: `ctx.respond` is set to `false` instead of writing to it.
 *
 * Optional: a route wrapped with `cancelableHandler` installs the signal on its own. Mounting this is
 * how one deadline or one `onDisconnect` hook covers a whole router, and how a cancellation raised by
 * request-scoped work outside `cancelableHandler` still gets an answer.
 */
export function cancelMiddleware<StateT = DefaultState, ContextT = DefaultContext>(
  options?: ICancelableHandlerOptions,
): Middleware<StateT, ContextT> {
  return async function cancelMiddlewareRoute(ctx, next) {
    ensureRequestCancelState(toRequestLike(ctx.req), toResponseLike(ctx.res), options);

    try {
      await next();
    } catch (error) {
      if (!isCancelError(error)) {
        throw error;
      }

      if (isUnanswerable(error, ctx.res)) {
        ctx.respond = false;

        return;
      }

      ctx.status = statusOf(error, DEFAULT_TIMEOUT_STATUS);
    }
  };
}

/**
 * Stops a server gracefully: no new connections, every in-flight handler canceled, and a bounded
 * wait for them to unwind. Resolves with what happened rather than throwing, and a second call while
 * the first is still running returns that same result, so a pair of signal handlers is safe to wire
 * without a guard.
 *
 * Takes the raw `http.Server` `app.listen()` hands back, not the koa application: koa has no `close`
 * of its own to sequence this against.
 */
export function drain(server: Server, options?: IDrainOptions): Promise<IDrainResult> {
  return drainServer(server, options);
}
