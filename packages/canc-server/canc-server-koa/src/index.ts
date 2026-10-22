import { CancelSignal, isCancelError } from '@cancjs/promise';
import type { Server } from 'http';
import type { Context, DefaultContext, DefaultState, Middleware, ParameterizedContext } from 'koa';

import { isUnanswerable, statusOf, toRequestLike, toResponseLike } from '../../../_server/exchange';
import { ensureRequestCancelState, getNodeRequestSignal, stopRequestDeadline } from '../../../_server/node-signal';
import { runCancelableHandler } from '../../../_server/run';
import { createServerShutdown } from '../../../_server/shutdown';
import { DEFAULT_TIMEOUT_STATUS } from '../../../_server/timeout';
import {
  ICancelableHandlerOptions,
  ICancelErrorHandlerOptions,
  IRequestLike,
  IResponseLike,
  IShutdownOptions,
  IShutdownResult,
  THandlerFn,
} from '../../../_server/types';
import { TAnyFn } from '../../../_util';

export { CLIENT_DISCONNECTED, HANDLER_TIMEOUT, SERVER_SHUTDOWN } from '../../../_server/reasons';
export type {
  ICancelableHandlerOptions,
  ICancelErrorHandlerOptions,
  IShutdownOptions,
  IShutdownResult,
} from '../../../_server/types';

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
 * The guarded replacement for node's own `IncomingMessage.prototype.signal`, which `ctx.req`
 * inherits. That signal aborts once the request stream finishes being read, not when the client
 * disconnects, so a body-carrying request would abort on arrival if a handler read it directly. This
 * one is wired from the response's close event instead, guarded so it fires only when the response
 * has not finished.
 *
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
 * one), a shutdown cancellation with the `status` option (default `503`), and a response that can
 * no longer be answered gets nothing: `ctx.respond` is set to `false` instead of writing to it.
 *
 * Optional: a route wrapped with `cancelableHandler` installs the signal on its own. Mounting this is
 * how one deadline or one `onDisconnect` hook covers a whole router, plain routes included, and how a
 * cancellation raised by request-scoped work outside `cancelableHandler` still gets an answer.
 *
 * The deadline starts here, and a route passing its own `timeout` restarts it. It ends once the
 * downstream middleware returns, so a body koa streams after that is not cut short. The lifecycle
 * callbacks run once per request.
 */
export function cancelMiddleware<StateT = DefaultState, ContextT = DefaultContext>(
  options?: ICancelableHandlerOptions & ICancelErrorHandlerOptions,
): Middleware<StateT, ContextT> {
  const fallback = options?.status ?? DEFAULT_TIMEOUT_STATUS;

  return async function cancelMiddlewareRoute(ctx, next) {
    const state = ensureRequestCancelState(toRequestLike(ctx.req), toResponseLike(ctx.res), options);

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

      // a head already sent cannot take a status, so the socket is cut instead of left looking complete
      if (ctx.res.headersSent === true) {
        ctx.res.destroy();
        ctx.respond = false;

        return;
      }

      // koa keeps a body assigned before the cancel, which would ride along under the error status
      // and a json type turns the cleared body into the text null
      ctx.remove('Content-Type');
      ctx.body = null;
      ctx.status = statusOf(error, fallback);
    } finally {
      stopRequestDeadline(state);
    }
  };
}

/**
 * Sets up a graceful shutdown and returns the function that runs it. Call it right after
 * `app.listen()`: connections and requests are recorded from this call on.
 *
 * The returned function stops the server: no new connections, a grace window for in-flight
 * handlers to finish, and a cancel for any still running when it ends (at once with
 * `cancelOnStart`). When it starts, connections carrying no request are closed and every in-flight
 * response is sent with `Connection: close`, so each connection closes once its response finishes.
 * It resolves with what happened rather than throwing. A second call while the first is still
 * running returns that same promise, so a pair of signal handlers is safe to wire without a guard.
 * Calling `createShutdown` again with the same server returns the same function.
 *
 * Created late, the shutdown loses nothing but drains slower, because a connection opened before
 * the call is unknown to it. Such a connection is closed only when the grace window ends if it has
 * sent no request yet, or if its request is still in flight and no wrapped handler or request
 * signal recorded it. That response also goes out without `Connection: close`.
 *
 * Takes the raw `http.Server` `app.listen()` hands back, not the koa application: koa has no `close`
 * of its own to sequence this against.
 */
export function createShutdown(server: Server): (options?: IShutdownOptions) => Promise<IShutdownResult> {
  return createServerShutdown(server);
}
