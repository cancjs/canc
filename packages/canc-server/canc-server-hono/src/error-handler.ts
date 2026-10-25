import type { CancelError } from '@cancjs/promise';
import type { Context, Env, ErrorHandler } from 'hono';

import { cancelHeadersFor, ownedStatusOf, STALE_CONTENT_HEADERS } from '../../../_server/exchange';
import { abandonIfHeadersSent, alreadySentHeaders, existingCancelState, isResponseUnreachable } from './bindings';
import { CLIENT_CLOSED_STATUS } from './handler';

/** Options for the opt-in error handler. */
export interface ICancelErrorHandlerOptions<E extends Env = any> {
  /**
   * What handles everything that is not a cancellation.
   * Defaults to answering with the response the error carries, if it has one, and otherwise
   * logging the error and answering `500`, as hono's own default does.
   */
  onError?: ErrorHandler<E>;
  /**
   * Status sent for a cancellation that carries none of its own.
   * Defaults to `503`.
   */
  status?: number;
}

interface IResponseCarrier {
  getResponse?: () => Response;
}

/**
 * Opt in error handler mapping a cancellation to a response. Mount it with `app.onError`.
 *
 * Hono is the one framework in this family that does not read a status off the error, so a deadline
 * would otherwise answer `500` no matter what the timeout option said. This reads it instead: a
 * deadline answers with the status stamped on it, a shutdown cancellation with the shutdown's `status`
 * option, or the handler's `status` option when the shutdown set none (default `503`). A cancellation
 * behind a response nobody can read gets `499`, and one the request does not own goes to the
 * non-cancellation path.
 */
export function cancelErrorHandler<E extends Env = any>(options: ICancelErrorHandlerOptions<E> = {}): ErrorHandler<E> {
  const onError = options.onError;

  return function cancelErrorRoute(error, c) {
    // Ownership comes from the request state, so an unowned cancel takes the path below.
    const state = existingCancelState(c);
    const status = state === undefined ? undefined : ownedStatusOf(error, state, options.status);

    if (status === undefined) {
      if (onError) {
        return onError(error, c);
      }

      // hono's own exceptions carry the response they want, and mounting this handler replaces the
      // default that would have honored it
      const carried = error as IResponseCarrier;

      if (typeof carried.getResponse === 'function') {
        return withContextHeaders(c, carried.getResponse());
      }

      console.error('[@cancjs/server-hono] request handler failed', error);

      return c.text('Internal Server Error', 500);
    }

    // a head already sent cannot take a status: cut the socket, then answer as unreachable
    if (abandonIfHeadersSent(c)) {
      console.error('[@cancjs/server-hono] response cut after its head was sent', error);
    }

    if (isResponseUnreachable(c)) {
      return new Response(null, { headers: alreadySentHeaders(c), status: CLIENT_CLOSED_STATUS });
    }

    // the route's headers and the cancellation's own go along
    // the body's content headers do not
    const response = new Response(null, { headers: c.body(null).headers, status });
    const headers = response.headers;

    for (const name of STALE_CONTENT_HEADERS) {
      headers.delete(name);
    }

    for (const [name, value] of Object.entries(cancelHeadersFor(error as CancelError, options.status) ?? {})) {
      headers.set(name, value);
    }

    return response;
  };
}

/** Adds the headers the route set on the context to a response that was built without them. */
function withContextHeaders(c: Context, response: Response): Response {
  c.body(null).headers.forEach((value, name) => {
    if (!response.headers.has(name)) {
      response.headers.set(name, value);
    }
  });

  return response;
}
