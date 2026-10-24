import { CancelSignal, isCancelError } from '@cancjs/promise';
import { type Server, STATUS_CODES } from 'http';
import type { Context, DefaultContext, DefaultState, Middleware, ParameterizedContext } from 'koa';

import {
  cancelHeadersFor,
  cancelStatusOf,
  stampDerivedCancel,
  toRequestLike,
  toResponseLike,
} from '../../../_server/exchange';
import { ensureRequestCancelState, getNodeRequestSignal, stopRequestDeadline } from '../../../_server/node-signal';
import { runCancelableHandler } from '../../../_server/run';
import { createServerShutdown } from '../../../_server/shutdown';
import { IStatusCancelError } from '../../../_server/timeout';
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
 * A cancellation the request owns is rethrown with the status and headers it answers with stamped on
 * it, so it reaches whatever `await next()` sits above this in the stack and koa's own error handling
 * answers it, `cancelMiddleware` included. A disconnect is the one cancellation dropped in place: the
 * client is gone, so `ctx.respond` is set to `false` and nothing is written. That is the whole reason
 * this family exposes no separate `cancelErrorHandler` for koa.
 *
 * Throws a `RangeError` when `timeout` names a status koa does not answer with.
 */
export function cancelableHandler<StateT = DefaultState, ContextT = DefaultContext, ResponseBodyT = unknown>(
  handler: THandlerFn<(ctx: ParameterizedContext<StateT, ContextT, ResponseBodyT>) => any>,
  options?: ICancelableHandlerOptions,
): (ctx: ParameterizedContext<StateT, ContextT, ResponseBodyT>) => Promise<void> {
  checkStatus(timeoutStatus(options?.timeout), 'timeout status');

  return async function cancelableRoute(ctx) {
    const task = runCancelableHandler(handler as TAnyFn, toRequestLike(ctx.req), toResponseLike(ctx.res), options, {
      args: [ctx],
      onLateFailure: (error) => ctx.app.emit('error', error, ctx),
    });

    try {
      await task;
    } catch (error) {
      if (prepareCancel(error, ctx)) {
        return;
      }

      throw error;
    }
  };
}

/**
 * Hands a cancellation of a koa request to koa's own error handling, or drops it. Returns `true` when
 * there is nothing to answer, which the caller swallows: the client left, or the response was finished
 * before the cancellation arrived. Otherwise an owned cancellation is stamped and the caller rethrows
 * it, so koa answers with the status and headers it carries and `app.on('error')` sees it. An unowned
 * cancellation passes through untouched.
 *
 * A sent head takes no status, so the socket is cut instead of left looking complete. The caller
 * still rethrows, so the cut is surfaced too. A shutdown's cut arrives with the socket already dead,
 * which is why a dead socket is not by itself a reason to drop.
 */
function prepareCancel(error: unknown, ctx: Context, option?: number): boolean {
  if (!isCancelError(error)) {
    return false;
  }

  const state = ensureRequestCancelState(toRequestLike(ctx.req), toResponseLike(ctx.res));
  // a shutdown sets `shuttingDown` before it cancels, and a deadline is flagged `timedOut`:
  // neither is a disconnect
  const disconnected = state.signal.aborted && state.shuttingDown !== true && error.timedOut !== true;

  if (disconnected || ctx.res.writableEnded === true) {
    ctx.respond = false;

    return true;
  }

  stampDerivedCancel(error, state);

  const status = cancelStatusOf(error, option);

  if (status === undefined) {
    return false;
  }

  if (ctx.res.headersSent === true) {
    ctx.res.destroy();
    ctx.respond = false;

    return false;
  }

  // koa's error handling answers with `err.status` and applies `err.headers`, so both carry the
  // status the option picked and the headers that come with it
  const carried = error as IStatusCancelError;

  carried.status = status;
  carried.statusCode = status;
  carried.headers = cancelHeadersFor(error, option) ?? {};

  return false;
}

/** The status of a `timeout` option, when it names one. */
function timeoutStatus(timeout: ICancelableHandlerOptions['timeout']): number | undefined {
  return typeof timeout === 'object' ? timeout.status : undefined;
}

/** Throws a `RangeError` for a status koa does not answer with, the same table koa's error handling reads. */
function checkStatus(status: number | undefined, name: string): void {
  if (status !== undefined && STATUS_CODES[status] === undefined) {
    throw new RangeError(`${name} ${status} is not a status koa answers with`);
  }
}

/**
 * The guarded replacement for node's own `IncomingMessage.prototype.signal`, which `ctx.req`
 * inherits. Node 18 has no such property. Before node 24.20 it aborts once the request stream
 * finishes being read, not when the client disconnects, so a body-carrying request would abort on
 * arrival if a handler read it directly; from 24.20 on it no longer aborts at the body end. This one
 * does not depend on the node version: it is wired from the response's close event, guarded so it
 * fires only when the response has not finished.
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
 * one), a shutdown cancellation with the shutdown's `status` option, or this `status` option when the
 * shutdown set none (default `503`). Every answer goes through koa's error handling, which emits
 * `error` on the app. A disconnect gets nothing: `ctx.respond` is set to `false`. A cancellation the
 * request does not own goes to koa's own error handling untouched.
 *
 * Throws a `RangeError` when `status` or `timeout.status` is not one koa answers with.
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
  checkStatus(options?.status, 'status');
  checkStatus(timeoutStatus(options?.timeout), 'timeout status');

  return async function cancelMiddlewareRoute(ctx, next) {
    const state = ensureRequestCancelState(toRequestLike(ctx.req), toResponseLike(ctx.res), options);

    try {
      await next();
    } catch (error) {
      if (prepareCancel(error, ctx, options?.status)) {
        return;
      }

      throw error;
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
 * `cancelAfter: 0`). A connection that has received no bytes is closed once it is five seconds old (or at the grace, if shorter), while one
 * that has already sent part of a request is left to finish. Every in-flight response is sent with
 * `Connection: close`, so each connection closes once its response finishes.
 * It resolves with what happened rather than throwing. A second call while the first is still
 * running returns that same promise, so a pair of signal handlers is safe to wire without a guard.
 * Calling `createShutdown` again with the same server returns the same function.
 *
 * Created late, the shutdown loses nothing but finishes slower, because a connection opened before
 * the call is unknown to it. Such a connection is closed only when `closeAfter` ends if it has
 * sent no request yet, or if its request is still in flight and no wrapped handler or request
 * signal recorded it. That response also goes out without `Connection: close`.
 *
 * Takes the raw `http.Server` `app.listen()` hands back, not the koa application: koa has no `close`
 * of its own to sequence this against.
 */
export function createShutdown(server: Server): (options?: IShutdownOptions) => Promise<IShutdownResult> {
  return createServerShutdown(server);
}
