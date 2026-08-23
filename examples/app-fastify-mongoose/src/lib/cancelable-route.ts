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

    // Disconnect is the reply socket closing, not the request stream ending. `request.raw`'s close
    // fires as soon as the request is consumed, which on a streaming reply is mid-response, so listen
    // on `reply.raw` and cancel only when the socket closed before the reply finished. Do not use
    // `request.signal`: fastify wires it the same wrong way internally (unconditional abort on
    // request.raw 'close', no guard).
    reply.raw.on('close', () => {
      if (!reply.raw.writableEnded) task.cancel('client disconnected');
    });
    // The socket may already be gone before this handler ran; cancel now rather than start work.
    if (request.raw.destroyed) task.cancel('client disconnected');

    return task.catch((err) => {
      if (isCancelError(err)) return; // canceled here, the client already left
      throw err;
    });
  };
}
