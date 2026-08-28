import { CancelSignal, isCancelError } from '@cancjs/promise';
import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
  RouteHandlerMethod,
} from 'fastify';

import { getNodeRequestSignal } from '../../../_server/node-signal';
import { runCancelableHandler } from '../../../_server/run';
import { ICancelableHandlerOptions, THandlerFn } from '../../../_server/types';
import { TAnyFn } from '../../../_util';

/**
 * A fastify route handler with only the route generic left open.
 *
 * Spelling the other seven type parameters once here is what keeps a bare
 * `function* (request, reply)` inferring both parameters at the call site.
 */
export type TFastifyRouteHandler<RouteGeneric extends RouteGenericInterface = RouteGenericInterface> =
  RouteHandlerMethod<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, RouteGeneric>;

/**
 * The cancel signal for a request, installed and wired on first use and shared with every other
 * consumer that asks for it.
 *
 * Request-scoped work outside the route, a database context or an outbound call, takes its signal
 * from here so one client disconnect cancels all of it through a single listener.
 */
export function getRequestSignal(request: Pick<FastifyRequest, 'raw'>, reply: Pick<FastifyReply, 'raw'>): CancelSignal {
  // deliberately not request.signal, which fastify 5 wires as raw.on('close', onAbort) with no
  // guard: measured on a POST with a body it aborts 1ms into the handler while rawAborted and
  // replyEnded are both still false, so an outbound call given that signal dies on arrival
  // this one is wired from the response instead, in the shared server core
  return getNodeRequestSignal(request.raw, reply.raw);
}

/**
 * Wraps a route handler so it is canceled when the client goes away or the deadline passes.
 *
 * A generator handler stops at its next `yield`. Any other handler runs signal-only: the request
 * signal still fires and a cancelable promise it returns is canceled, but a plain `async` body has
 * no suspension point to unwind and runs to completion.
 *
 * The wrapper never writes the response. A disconnect is swallowed because there is nobody left to
 * answer; everything else, deadlines included, reaches the fastify error handler.
 */
export function cancelableHandler<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>(
  handler: THandlerFn<TFastifyRouteHandler<RouteGeneric>, RouteGeneric['Reply']>,
  options?: ICancelableHandlerOptions,
): TFastifyRouteHandler<RouteGeneric> {
  const wrapped = function (
    this: FastifyInstance,
    request: FastifyRequest<RouteGeneric>,
    reply: FastifyReply<RouteGeneric>,
  ): Promise<RouteGeneric['Reply'] | undefined> {
    const task = runCancelableHandler<RouteGeneric['Reply']>(handler as TAnyFn, request.raw, reply.raw, options, {
      args: [request, reply],
      thisArg: this,
    });

    return task.catch((error: unknown) => {
      if (!isUnanswerable(error, reply.raw)) {
        throw error;
      }

      // hijack, not the reply.sent flag fastify 5 deprecated: it is the supported way to say the
      // response is no longer fastify's to write, and it is read before any send is attempted
      reply.hijack();

      return undefined;
    });
  };

  // fastify resolves a route's return type through a conditional over the route generic, which
  // cannot be evaluated while that generic is still a type parameter here
  return wrapped as TFastifyRouteHandler<RouteGeneric>;
}

/** Whether the response this error surfaced on is already unreachable. */
export function isUnanswerable(error: unknown, raw: RawReplyDefaultExpression): boolean {
  return isCancelError(error) && !error.timedOut && isResponseGone(raw);
}

function isResponseGone(raw: RawReplyDefaultExpression): boolean {
  // read off the raw response rather than reply.sent: a premature close leaves writableEnded
  // false, because nothing was ever sent, while the socket is already destroyed, and that pair is
  // what separates a dead client from a completed response
  return raw.writableEnded !== true && (raw.destroyed === true || raw.writable === false);
}
