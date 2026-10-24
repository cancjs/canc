import { CancelSignal, isCancelError } from '@cancjs/promise';
import type { IncomingMessage, Server, ServerResponse } from 'http';

import {
  cancelStatusOf,
  isResponseLive,
  isUnanswerable,
  toRequestLike,
  toResponseLike,
} from '../../../_server/exchange';
import { getNodeRequestSignal } from '../../../_server/node-signal';
import { runCancelableHandler } from '../../../_server/run';
import { createServerShutdown } from '../../../_server/shutdown';
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

/** Status answered for a handler failure that is not a cancellation. */
const HANDLER_FAILED_STATUS = 500;

/** A plain node handler: the shape `cancelableHandler` accepts alongside the generator form. */
export type TNodeHandler<
  TReq extends IncomingMessage = IncomingMessage,
  TRes extends ServerResponse = ServerResponse,
> = (req: TReq, res: TRes) => unknown;

/** What settles a request once its handler rejects: the response is still reachable here. */
export type TNodeErrorHandler<
  TReq extends IncomingMessage = IncomingMessage,
  TRes extends ServerResponse = ServerResponse,
> = (error: unknown, req: TReq, res: TRes) => void;

/** Options `cancelableHandler` accepts, adding the answer for errors raw node has no middleware to forward to. */
export interface INodeCancelableHandlerOptions<
  TReq extends IncomingMessage = IncomingMessage,
  TRes extends ServerResponse = ServerResponse,
> extends ICancelableHandlerOptions {
  /**
   * Called when the handler settles with anything other than a swallowed disconnect: a deadline, a
   * shutdown cancellation whose socket is still live, or a plain thrown error. Raw node has no
   * `next(err)` or error middleware to fall back to, so this is the answer for adapters (restify,
   * AdonisJS, a Pages Router API route, Nest on top of the raw server) with their own error
   * pipeline. Defaults to `cancelErrorHandler()`.
   */
  onError?: TNodeErrorHandler<TReq, TRes>;
}

/** Options `cancelErrorHandler` accepts on raw node, adding the opt-in rethrow. */
export interface INodeCancelErrorHandlerOptions extends ICancelErrorHandlerOptions {
  /**
   * Throws anything that is not a cancellation instead of answering `500`. Nothing awaits the
   * throw, so it surfaces as an unhandled rejection and, under node's default settings, ends the
   * process without answering the request. Opt in only where a process level handler is installed
   * to receive it.
   * Defaults to `false`.
   */
  rethrow?: boolean;
}

/**
 * Wraps a raw `(req, res)` handler so its work stops when the request does.
 *
 * A generator handler is driven as a coroutine and unwinds at its next `yield`, so `finally` blocks
 * run and downstream work never starts. Any other handler runs signal-only: the request signal still
 * fires and a cancelable promise the handler returns is canceled, but a plain `async` body has no
 * suspension points and runs to completion. Both flavors infer their parameters from a bare
 * `function* (req, res)` with no annotations.
 *
 * There is no middleware layer here, unlike the framework packages: raw node has no shared request
 * pipeline to install one into, so `getRequestSignal` installs the signal lazily on first use and the
 * `options` given to `cancelableHandler` are the only place to configure a route.
 *
 * Errors reach `options.onError` (default `cancelErrorHandler()`), with one exception: a cancellation
 * that is not a deadline and whose response can no longer be answered is dropped, because there is
 * nobody left to answer.
 */
export function cancelableHandler<
  TReq extends IncomingMessage = IncomingMessage,
  TRes extends ServerResponse = ServerResponse,
>(
  handler: THandlerFn<TNodeHandler<TReq, TRes>>,
  options?: INodeCancelableHandlerOptions<TReq, TRes>,
): (req: TReq, res: TRes) => void {
  const onError = options?.onError ?? cancelErrorHandler<TReq, TRes>();

  return function cancelableRoute(req, res) {
    const task = runCancelableHandler(handler as TAnyFn, toRequestLike(req), toResponseLike(res), options, {
      args: [req, res],
    });

    task.catch((error: unknown) => {
      if (isUnanswerable(error, res)) {
        return;
      }

      onError(error, req, res);
    });
  };
}

/**
 * The guarded replacement for node's own `IncomingMessage.prototype.signal`. Node 18 has no such
 * property. Before node 24.20 it aborts once the request stream finishes being read, not when the
 * client disconnects, so a body-carrying request would abort on arrival if a handler read it
 * directly; from 24.20 on it no longer aborts at the body end. This one does not depend on the node
 * version: it is wired from the response's close event, guarded so it fires only when the response
 * has not finished.
 *
 * The cancel signal for a request, installed and wired on first use and cached for every later
 * caller. Request-scoped work started outside the handler, a database context or a job handle, takes
 * the same signal and stops with the same cancellation instead of wiring a second listener.
 */
export function getRequestSignal(req: IncomingMessage, res: ServerResponse): CancelSignal {
  return getNodeRequestSignal(req as IRequestLike, res as unknown as IResponseLike);
}

/**
 * Opt-in error handler mapping a cancellation to a response. This is `cancelableHandler`'s default
 * `onError`; pass it (or a wrapper around it) explicitly when a route needs its own status mapping.
 *
 * A deadline answers with the status stamped on it (`503` unless the timeout option names another
 * one), a shutdown cancellation with the `status` option (default `503`), and a response that can no
 * longer be answered gets nothing. A response whose head already went out cannot carry a status, so
 * its connection is destroyed and the client sees an aborted message instead of a body that looks
 * whole.
 * Anything that is not a cancellation answers `500` and is logged.
 *
 * The other four adapters hand such an error to the framework's own error handler, and this is the
 * closest raw node gets to the same thing: there is no pipeline behind the wrapper, so it holds the
 * only reference left to a response the client is still waiting on. Pass `rethrow: true` to get the
 * throw back where a process level handler is installed to take it.
 */
export function cancelErrorHandler<
  TReq extends IncomingMessage = IncomingMessage,
  TRes extends ServerResponse = ServerResponse,
>(options: INodeCancelErrorHandlerOptions = {}): TNodeErrorHandler<TReq, TRes> {
  const rethrow = options.rethrow === true;

  return function cancelErrorRoute(error, _req, res) {
    if (!isCancelError(error)) {
      if (rethrow) {
        throw error;
      }

      // the status alone would bury a handler bug: nothing downstream of here ever sees the error
      logHandlerFailure(error);
      answerWith(res, HANDLER_FAILED_STATUS);

      return;
    }

    answerWith(res, cancelStatusOf(error, options.status));
  };
}

/** Sends a bare status to a response that can still carry one. */
function answerWith(res: ServerResponse, status: number): void {
  if (!isResponseLive(res)) {
    return;
  }

  // end() would write the chunked terminator and pass a cut body off as complete
  if (res.headersSent) {
    res.destroy();

    return;
  }

  res.statusCode = status;
  res.end();
}

function logHandlerFailure(error: unknown): void {
  console.error('[@cancjs/server-node] request handler failed', error);
}

/**
 * Sets up a graceful shutdown and returns the function that runs it. Call it right after
 * `listen()`: connections and requests are recorded from this call on.
 *
 * The returned function stops the server: no new connections, a grace window for in-flight
 * handlers to finish, and a cancel for any still running when it ends (at once with
 * `cancelAfter: 0`). A connection that has received no bytes is closed once it is five seconds old (or at the grace, if shorter), while one
 * that has already sent part of a request is left to finish. Every in-flight response is sent with
 * `Connection: close`, so each connection closes once its response finishes.
 * It resolves with what happened rather than throwing. A second call while the first is still
 * running returns that same promise, so wiring it to both `SIGTERM` and `SIGINT` needs no guard.
 * Calling `createShutdown` again with the same server returns the same function.
 *
 * Created late, the shutdown loses nothing but finishes slower, because a connection opened before
 * the call is unknown to it. Such a connection is closed only when the grace window ends if it has
 * sent no request yet, or if its request is still in flight and no wrapped handler or request
 * signal recorded it. That response also goes out without `Connection: close`.
 */
export function createShutdown(server: Server): (options?: IShutdownOptions) => Promise<IShutdownResult> {
  return createServerShutdown(server);
}
