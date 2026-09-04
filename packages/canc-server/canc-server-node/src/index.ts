import { CancelSignal, isCancelError } from '@cancjs/promise';
import type { IncomingMessage, Server, ServerResponse } from 'http';

import { isResponseLive, isUnanswerable, statusOf, toRequestLike, toResponseLike } from '../../../_server/exchange';
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
 * one), a shutdown cancellation with the fallback status, and a response that can no longer be
 * answered gets nothing. Anything that is not a cancellation is rethrown: raw node has nowhere further to
 * forward it to, and nothing here awaits the throw, so it surfaces as an unhandled rejection instead
 * of being silently dropped.
 */
export function cancelErrorHandler<
  TReq extends IncomingMessage = IncomingMessage,
  TRes extends ServerResponse = ServerResponse,
>(options: ICancelErrorHandlerOptions = {}): TNodeErrorHandler<TReq, TRes> {
  const fallback = options.status ?? DEFAULT_TIMEOUT_STATUS;

  return function cancelErrorRoute(error, _req, res) {
    if (!isCancelError(error)) {
      throw error;
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

    res.statusCode = statusOf(error, fallback);
    res.end();
  };
}

/**
 * Stops a server gracefully: no new connections, every in-flight handler canceled, and a bounded
 * wait for them to unwind. Resolves with what happened rather than throwing, and a second call while
 * the first is still running returns that same result, so wiring it to both `SIGTERM` and `SIGINT`
 * needs no guard.
 */
export function shutdown(server: Server, options?: IShutdownOptions): Promise<IShutdownResult> {
  return shutdownServer(server, options);
}
