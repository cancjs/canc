import { CancelSignal, isCancelError } from '@cancjs/promise';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ParamsDictionary, Query } from 'express-serve-static-core';
import type { IncomingMessage, Server, ServerResponse } from 'http';

import { isResponseLive, isUnanswerable, statusOf, toRequestLike, toResponseLike } from '../../../_server/exchange';
import { getRequestState } from '../../../_server/holder';
import { getNodeRequestSignal } from '../../../_server/node-signal';
import { runCancelableHandler } from '../../../_server/run';
import { shutdownServer } from '../../../_server/shutdown';
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
 * run and downstream work never starts. Any other handler runs signal-only: the request signal
 * still fires and a cancelable promise the handler returns is canceled, but a plain `async` body
 * has no suspension points and runs to completion. Both flavors keep their normal express typings,
 * including a bare `function* (req, res)` with no annotations.
 *
 * Errors reach express through `next(err)`, with two exceptions. A cancellation that is not a
 * deadline and whose response can no longer be answered is dropped, because there is nobody left
 * to answer. And a request forwards one cancellation at most: when a deadline cancels a middleware
 * still running after `next()` together with the route behind it, only the first reaches the error
 * handlers.
 */
export function cancelableHandler<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = Query,
  Locals extends Record<string, any> = Record<string, any>,
>(
  handler: THandlerFn<RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals>>,
  options?: ICancelableHandlerOptions,
): RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals> {
  return function cancelableRoute(req, res, next) {
    const task = runCancelableHandler(handler as TAnyFn, toRequestLike(req), toResponseLike(res), options, {
      args: [req, res],
      next,
    });

    task.catch((error: unknown) => {
      if (isUnanswerable(error, res) || !claimForward(req, error)) {
        return;
      }

      next(error);
    });
  };
}

// express keeps one cursor per request, so a second next(err) resumes past the error handler that
// answered the first and lands in finalhandler
function claimForward(req: IncomingMessage, error: unknown): boolean {
  const state = isCancelError(error) ? getRequestState(toRequestLike(req)) : undefined;

  if (!state) {
    return true;
  }

  if (state.cancelForwarded) {
    return false;
  }

  state.cancelForwarded = true;

  return true;
}

/**
 * The guarded replacement for node's own `IncomingMessage.prototype.signal`. That signal aborts once
 * the request stream finishes being read, not when the client disconnects, so a body-carrying POST
 * behind `express.json()` would abort at the start of the handler with the client still connected if
 * a handler read it directly. This one is wired from the response's close event instead, guarded so
 * it fires only when the response has not finished.
 *
 * The cancel signal for a request, installed and wired on first use and cached for every later
 * caller. Request-scoped work started outside a route, a database context or a job handle, takes
 * the same signal and stops with the same cancellation instead of wiring a second listener.
 *
 * Typed against the raw node request and response, which every express request is, so a route with
 * its own path parameter or body types passes without a cast.
 */
export function getRequestSignal(req: IncomingMessage, res: ServerResponse): CancelSignal {
  return getNodeRequestSignal(req as IRequestLike, res as unknown as IResponseLike);
}

/**
 * App or router level middleware that installs the request signal up front and supplies the options
 * every handler on the request inherits. A route's own options are merged over these, key by key.
 *
 * Optional: a handler wrapped without it installs the signal on its own. Mounting it is how one
 * deadline or one `onDisconnect` hook covers a whole router, plain routes included. The deadline
 * starts here, and a route passing its own `timeout` restarts it. It ends when the response closes,
 * or once the wrapped handler answering the request settles, so a body streamed after the handler
 * returned is not cut short. The lifecycle callbacks run once per request, however many wrapped
 * layers it passes.
 */
export function cancelMiddleware(options?: ICancelableHandlerOptions): RequestHandler {
  return function cancelMiddlewareRoute(req, res, next) {
    getNodeRequestSignal(toRequestLike(req), toResponseLike(res), options);
    next();
  };
}

/**
 * Opt-in error handler mapping a cancellation to a response. Mount it last, after the routes.
 *
 * A deadline answers with the status stamped on it (`503` unless the timeout option names another
 * one), a shutdown cancellation with the fallback status, and a response that can no longer be
 * answered gets nothing. A response whose head already went out cannot carry a status, so its
 * connection is destroyed and the client sees an aborted message instead of a body that looks whole.
 * Anything that is not a cancellation passes through untouched.
 */
export function cancelErrorHandler(options: ICancelErrorHandlerOptions = {}): ErrorRequestHandler {
  const fallback = options.status ?? DEFAULT_TIMEOUT_STATUS;

  return function cancelErrorRoute(error, _req, res, next) {
    if (!isCancelError(error)) {
      next(error);

      return;
    }

    if (!isResponseLive(res)) {
      return;
    }

    // end() would write the chunked terminator and pass a cut body off as complete
    if (res.headersSent) {
      res.destroy();

      return;
    }

    res.status(statusOf(error, fallback)).end();
  };
}

/**
 * Stops a server gracefully: no new connections, a grace window for in-flight handlers to finish,
 * and a cancel for any still running when it ends (at once with `cancelOnStart`). Resolves with what
 * happened rather than throwing, and a second call while the first is still running returns that
 * same result, so a pair of signal handlers is safe to wire without a guard.
 */
export function shutdown(server: Server, options?: IShutdownOptions): Promise<IShutdownResult> {
  return shutdownServer(server, options);
}
