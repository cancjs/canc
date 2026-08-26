import { CancelError, CancelSignal, isCancelError } from '@cancjs/promise';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ParamsDictionary, Query } from 'express-serve-static-core';
import type { IncomingMessage, Server, ServerResponse } from 'http';

import { drainServer } from '../../../_server/drain';
import { getNodeRequestSignal } from '../../../_server/node-signal';
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

/** Options for the opt-in error handler. */
export interface ICancelErrorHandlerOptions {
  /**
   * Status sent for a cancellation that carries none of its own.
   * Defaults to `503`.
   */
  status?: number;
}

/**
 * Wraps a route handler so its work stops when the request does.
 *
 * A generator handler is driven as a coroutine and unwinds at its next `yield`, so `finally` blocks
 * run and downstream work never starts. Any other handler runs signal-only: the request signal
 * still fires and a cancelable promise the handler returns is canceled, but a plain `async` body
 * has no suspension points and runs to completion. Both flavors keep their normal express typings,
 * including a bare `function* (req, res)` with no annotations.
 *
 * Errors reach express through `next(err)`, with one exception: a cancellation that is not a
 * deadline and whose socket is already gone is dropped, because there is nobody left to answer.
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
      args: [req, res, next],
    });

    task.catch((error: unknown) => {
      if (isUnanswerable(error, res)) {
        return;
      }

      next(error);
    });
  };
}

/**
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
 * deadline or one `onDisconnect` hook covers a whole router.
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
 * one), a shutdown cancellation with the fallback status, and a client that has already gone away
 * gets nothing. Anything that is not a cancellation passes through untouched.
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

    // a partially written response cannot carry a status any more, so the only honest move left is
    // to stop writing and let the client see a truncated body
    if (res.headersSent) {
      res.end();

      return;
    }

    res.status(statusOf(error, fallback)).end();
  };
}

/**
 * Stops a server gracefully: no new connections, every in-flight handler canceled, and a bounded
 * wait for them to unwind. Resolves with what happened rather than throwing, and a second call
 * while the first is still running returns that same result, so a pair of signal handlers is safe
 * to wire without a guard.
 */
export function drain(server: Server, options?: IDrainOptions): Promise<IDrainResult> {
  return drainServer(server, options);
}

// the shared core takes structural stand-ins rather than the ambient node types, so one cast per
// direction here is the whole boundary
function toRequestLike(req: unknown): IRequestLike {
  return req as IRequestLike;
}

function toResponseLike(res: unknown): IResponseLike {
  return res as IResponseLike;
}

interface IResponseState {
  writableEnded?: boolean;
  destroyed?: boolean;
}

// `destroyed`, never `writable`: measured on node 24.18.1 with express 5.2.1, a response whose
// client left mid-handler reports destroyed=true, writableEnded=false and writable=true
function isResponseLive(res: IResponseState): boolean {
  return res.writableEnded !== true && res.destroyed !== true;
}

// discriminator is `isCancelError(err) && !err.timedOut`, never a message check, never instanceof
// a deadline still has a client to answer; a disconnect that outlived its socket has no addressee
function isUnanswerable(error: unknown, res: IResponseState): boolean {
  return isCancelError(error) && !error.timedOut && !isResponseLive(res);
}

function statusOf(error: CancelError, fallback: number): number {
  const carried = error as CancelError & { status?: unknown; statusCode?: unknown };

  if (typeof carried.status === 'number') {
    return carried.status;
  }

  if (typeof carried.statusCode === 'number') {
    return carried.statusCode;
  }

  return fallback;
}
