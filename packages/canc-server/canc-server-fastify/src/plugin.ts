import { isCancelError } from '@cancjs/promise';
import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import { ensureRequestCancelState } from '../../../_server/node-signal';
import { ICancelableHandlerOptions } from '../../../_server/types';
import { isUnanswerable } from './handler';

/** Status reported when a cancellation reaches the error handler with the client still connected. */
const CANCELED_STATUS = 503;

/** What an error handler does with a cancellation the wrapper forwarded. */
export interface ICancelErrorHandlerOptions {
  /** Status sent when a cancellation surfaces on a live connection. Defaults to 503. */
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
 * it sets. Nothing is decorated onto the request or the instance, so no module augmentation is
 * needed to use this.
 */
export const cancelPlugin = fastifyPlugin(plugin, {
  fastify: '5.x',
  name: '@cancjs/server-fastify',
});

/**
 * An error handler that finishes what the wrapper deliberately left alone.
 *
 * A cancellation that arrives with the client already gone is dropped, because the response is
 * unreachable. A cancellation on a live connection answers with a status. Everything else, a
 * missed deadline included, goes to fastify's own handling, which reads the status off the error.
 */
export function cancelErrorHandler(options?: ICancelErrorHandlerOptions): TCancelErrorHandler {
  const canceledStatus = options?.canceledStatus ?? CANCELED_STATUS;

  return function cancelAwareErrorHandler(error, _request, reply) {
    if (isUnanswerable(error, reply.raw)) {
      reply.hijack();

      return;
    }

    if (isCancelError(error) && !error.timedOut) {
      // fastify reads status then statusCode off the error, so stamping it is all the mapping a
      // shutdown cancellation needs
      (error as { statusCode?: number }).statusCode ??= canceledStatus;
    }

    reply.send(error);
  };
}
