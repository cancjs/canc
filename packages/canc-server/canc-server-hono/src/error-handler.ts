import { isCancelError } from '@cancjs/promise';
import type { Env, ErrorHandler } from 'hono';

import { cancelStatusOf } from '../../../_server/exchange';
import { abandonIfHeadersSent, alreadySentHeaders, isResponseUnreachable } from './bindings';
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
 * deadline answers with the status stamped on it, a shutdown cancellation with the `status` option
 * (default `503`), and a cancellation behind a response nobody can read gets `499`.
 */
export function cancelErrorHandler<E extends Env = any>(options: ICancelErrorHandlerOptions<E> = {}): ErrorHandler<E> {
  const onError = options.onError;

  return function cancelErrorRoute(error, c) {
    if (!isCancelError(error)) {
      if (onError) {
        return onError(error, c);
      }

      // hono's own exceptions carry the response they want, and mounting this handler replaces the
      // default that would have honored it
      const carried = error as IResponseCarrier;

      if (typeof carried.getResponse === 'function') {
        return carried.getResponse();
      }

      console.error('[@cancjs/server-hono] request handler failed', error);

      return c.text('Internal Server Error', 500);
    }

    // a head already sent cannot take a status: cut the socket, then answer as unreachable
    abandonIfHeadersSent(c);

    if (isResponseUnreachable(c)) {
      return new Response(null, { headers: alreadySentHeaders(c), status: CLIENT_CLOSED_STATUS });
    }

    return new Response(null, { status: cancelStatusOf(error, options.status) });
  };
}
