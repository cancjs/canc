import * as canc from '@cancjs/coroutine';
import { isCancelError } from '@cancjs/promise';
import { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Wraps a generator route handler as a canc coroutine and cancels it when the client
 * disconnects before the reply is sent. The handler keeps full control over `request`/`reply`,
 * including sending the response itself; this only adds the cancellation wiring around it.
 *
 * Copy this file into an app that needs the same wiring; it has no example-specific dependencies.
 */
export function cancAsyncRoute(handler: (request: FastifyRequest, reply: FastifyReply) => Generator) {
  return (request: FastifyRequest, reply: FastifyReply) => {
    const task = canc.async(handler)(request, reply);

    // listen on reply.raw because request.raw close fires as soon as body is consumed
    reply.raw.on('close', () => {
      if (!reply.raw.writableEnded) task.cancel('client disconnected');
    });
    // cancel early if socket was already destroyed before handler ran
    if (request.raw.destroyed) task.cancel('client disconnected');

    return task.catch((err) => {
      if (isCancelError(err)) return; // canceled on client disconnect
      throw err;
    });
  };
}
