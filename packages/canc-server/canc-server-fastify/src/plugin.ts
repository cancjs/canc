import { isCancelError } from '@cancjs/promise';
import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import { cancelStatusOf, isUnanswerable } from '../../../_server/exchange';
import { getRequestRegistry } from '../../../_server/holder';
import { ensureRequestCancelState } from '../../../_server/node-signal';
import { ICancelableHandlerOptions } from '../../../_server/types';

/** What an error handler does with a cancellation the wrapper forwarded. */
export interface ICancelErrorHandlerOptions {
  /** Status sent when a cancellation surfaces on a live connection. Defaults to 503. */
  status?: number;
  /** @deprecated Read `status` instead. Kept so existing `canceledStatus` callers keep working. */
  canceledStatus?: number;
}

/** The shape `fastify.setErrorHandler` accepts. */
export type TCancelErrorHandler = (
  this: FastifyInstance,
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
) => void;

const plugin: FastifyPluginAsync<ICancelableHandlerOptions> = function cancelPlugin(fastify, options) {
  // the instance holds its server from the start, so a shutdown knows every request, plain ones too
  getRequestRegistry(fastify.server, true);

  // onRequest is the earliest hook, so the signal exists before body parsing and before any
  // request-scoped work a later hook starts
  fastify.addHook('onRequest', (request, reply, done) => {
    ensureRequestCancelState(request.raw, reply.raw, options);
    done();
  });

  return Promise.resolve();
};

/**
 * Installs the per-request cancel signal for every route, and supplies the options each wrapped
 * handler inherits.
 *
 * Registered options are defaults: a route passing its own to `cancelableHandler` wins on every key
 * it sets. A registered deadline starts at `onRequest` and reaches plain routes too, where it aborts the request signal and runs
 * `onTimeout` while the route itself still answers; a route passing
 * its own `timeout` restarts it. It ends when the response closes, or once the wrapped route handler
 * settles, so a body streamed after the handler returned is not cut short. The lifecycle callbacks
 * run once per request, however many wrapped hooks it passes. Nothing is decorated onto the request
 * or the instance, so no module augmentation is needed to use this.
 */
export const cancelPlugin = fastifyPlugin(plugin, {
  fastify: '>=5.0.0',
  name: '@cancjs/server-fastify',
});

/**
 * An error handler that finishes what the wrapper deliberately left alone.
 *
 * A cancellation that arrives on a response which can no longer be answered is dropped. A
 * cancellation on a live connection answers with a status. Everything else, a missed deadline
 * included, goes to fastify's own handling, which reads the status off the error.
 */
export function cancelErrorHandler(options?: ICancelErrorHandlerOptions): TCancelErrorHandler {
  const configured = options?.status ?? options?.canceledStatus;

  return function cancelAwareErrorHandler(error, _request, reply) {
    if (isUnanswerable(error, reply.raw)) {
      reply.hijack();

      return;
    }

    // a head already sent cannot take a status, so the socket is cut instead of left looking complete
    if (isCancelError(error) && reply.raw.headersSent) {
      reply.raw.destroy();
      reply.hijack();

      return;
    }

    if (isCancelError(error) && !error.timedOut) {
      // fastify reads status then statusCode off the error, so stamping it is all the mapping a
      // shutdown cancellation needs
      const code = cancelStatusOf(error, configured);
      (error as { status?: number; statusCode?: number }).status = code;
      (error as { statusCode?: number }).statusCode = code;
    }

    reply.send(error);
  };
}
