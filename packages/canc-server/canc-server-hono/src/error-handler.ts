import { CancelError, isCancelError } from '@cancjs/promise';
import type { Env, ErrorHandler } from 'hono';

import { DEFAULT_TIMEOUT_STATUS } from '../../../_server/timeout';
import { isClientGone } from './bindings';
import { CLIENT_CLOSED_STATUS } from './handler';

/** Options for the opt-in error handler. */
export interface ICancelErrorHandlerOptions<E extends Env = any> {
  /**
   * What handles everything that is not a cancellation.
   * Defaults to answering with the response the error carries, if it has one, and rethrowing
   * otherwise.
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
 * deadline answers with the status stamped on it, a shutdown cancellation with the fallback status,
 * and a client that has already gone away gets `499` that nobody reads.
 */
export function cancelErrorHandler<E extends Env = any>(options: ICancelErrorHandlerOptions<E> = {}): ErrorHandler<E> {
  const fallback = options.status ?? DEFAULT_TIMEOUT_STATUS;
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

      throw error;
    }

    if (isClientGone(c)) {
      return new Response(null, { status: CLIENT_CLOSED_STATUS });
    }

    return new Response(null, { status: statusOf(error, fallback) });
  };
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
