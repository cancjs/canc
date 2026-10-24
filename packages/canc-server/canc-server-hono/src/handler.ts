import { CancelablePromise, CancelSignal, isCancelError } from '@cancjs/promise';
import type { Env, Handler, Input, MiddlewareHandler, TypedResponse } from 'hono';

import { stopRequestDeadline } from '../../../_server/node-signal';
import { IHandlerCall, runCancelableHandler } from '../../../_server/run';
import { ICancelableHandlerOptions, IRequestLike, IResponseLike, THandlerFn } from '../../../_server/types';
import { TAnyFn } from '../../../_util';
import {
  abandonIfHeadersSent,
  alreadySentHeaders,
  ensureCancelState,
  getNodeBindings,
  ICancelContext,
  isResponseUnreachable,
} from './bindings';

/**
 * Status answered with when a cancellation surfaces on a request whose client has already gone.
 *
 * A hono handler always resolves to a response, and this one has no reader left. `499` is what
 * nginx logs when a client closes the request first, so the status names the situation for the
 * access log or the middleware that does see it.
 */
export const CLIENT_CLOSED_STATUS = 499;

/** What a hono route handler is allowed to answer with. */
type THonoResponse = Response | TypedResponse<any>;

/** A route that validates nothing, which is hono's own default and not part of its public entry. */
type TBlankInput = Record<never, never>;

/**
 * A hono route handler with its own three type parameters left open.
 *
 * The parameter defaults mirror hono's own, `any` included, which is what lets a bare
 * `function* (c, next)` infer both parameters and still mount on a typed app. The response type is
 * the one place this does not follow hono, whose own default is `any`: leaving it there would let
 * the plain handler branch of the wrapper's argument accept a generator returning anything at all,
 * and the point of naming a return type here is that a route answering with a plain object is
 * caught at the call site.
 */
export type THonoHandler<E extends Env = any, P extends string = any, I extends Input = TBlankInput> = Handler<
  E,
  P,
  I,
  THonoResponse | Promise<THonoResponse>
>;

// a Web runtime has no response object; the shared core reads only these two members, and its
// teardown runs when the handler settles, so nothing here has to emit anything
const WEB_RESPONSE: IResponseLike = {
  once: noop,
  writableEnded: false,
};

/**
 * Wraps a route handler so its work stops when the request does.
 *
 * A generator handler is driven as a coroutine and unwinds at its next `yield`, so `finally` blocks
 * run and downstream work never starts. Any other handler runs signal only: the request signal
 * still fires and a cancelable promise the handler returns is canceled, but a plain `async` body
 * has no suspension points and runs to completion.
 *
 * On `@hono/node-server` the cancellation is wired from the node response. On a Web standard
 * runtime it comes from `Request.signal`, which on that side does mean the client went away.
 *
 * The wrapper never writes the response. A cancellation on a response that can no longer be
 * answered gets `499`, because hono has to be handed something; everything else, deadlines
 * included, is thrown on to whatever `app.onError` is mounted.
 */
export function cancelableHandler<E extends Env = any, P extends string = any, I extends Input = TBlankInput>(
  handler: THandlerFn<THonoHandler<E, P, I>, Response>,
  options?: ICancelableHandlerOptions,
): Handler<E, P, I, Promise<Response>> {
  return function cancelableRoute(c, next) {
    const context: ICancelContext = c;
    const task = startTask(handler as TAnyFn, context, options, {
      args: [c],
      next,
      onLateFailure: (error) => console.error('[@cancjs/server-hono] late failure', error),
    });

    return task.catch((error: unknown) => {
      // a sent head cannot take a status: cut the socket first, so the response left behind is
      // the unreachable one below and nothing is written over the head
      const headCut = isCancelError(error) && abandonIfHeadersSent(context);

      // the documented discriminator, never a message check and never instanceof: a deadline
      // still has a client to answer, a cancellation behind an unreachable response has none
      if (isCancelError(error) && (!error.timedOut || headCut) && isResponseUnreachable(context)) {
        return new Response(null, { headers: alreadySentHeaders(context), status: CLIENT_CLOSED_STATUS });
      }

      throw error;
    });
  };
}

/**
 * On `@hono/node-server`, the guarded replacement for node's own `IncomingMessage.prototype.signal`.
 * Node 18 has no such property. Before node 24.20 it aborts once the request stream finishes being
 * read rather than when the client disconnects, so a body-carrying request would abort on arrival if
 * a handler read it directly; from 24.20 on it no longer aborts at the body end. This signal does
 * not depend on the node version: it is wired from the node response. On a Web standard runtime
 * there is no such defect to guard against, so this reads `Request.signal` as-is.
 *
 * The cancel signal for a request, installed and wired on first use and cached for every later
 * caller. Request scoped work started outside a route, a database context or an outbound call,
 * takes the same signal and stops with the same cancellation instead of wiring a second listener.
 */
export function getRequestSignal(c: ICancelContext): CancelSignal {
  return ensureCancelState(c).signal;
}

/**
 * Middleware that installs the request signal up front and supplies the options every handler on
 * the request inherits. A route's own options are merged over these, key by key.
 *
 * Optional: a handler wrapped without it installs the signal on its own. Mounting it is how one
 * deadline or one `onDisconnect` hook covers a whole app, plain routes included. The deadline starts
 * here, and a route passing its own `timeout` restarts it. It ends once the downstream handlers
 * return, so a body streamed after that is not cut short. The lifecycle callbacks run once per
 * request.
 */
export function cancelMiddleware<E extends Env = any>(options?: ICancelableHandlerOptions): MiddlewareHandler<E> {
  return async function cancelMiddlewareRoute(c, next) {
    const state = ensureCancelState(c, options);

    try {
      await next();
    } finally {
      stopRequestDeadline(state);
    }
  };
}

function startTask(
  handler: TAnyFn,
  context: ICancelContext,
  options: ICancelableHandlerOptions | undefined,
  call: IHandlerCall,
): CancelablePromise<Response> {
  const bindings = getNodeBindings(context.env);

  if (bindings) {
    return runCancelableHandler<Response>(handler, bindings.incoming, bindings.outgoing, options, call);
  }

  // installed before the shared server core reaches for it, so it finds the Web flavored state
  // instead of wiring the node one against a response that does not exist
  // options stay out of this call on purpose: they belong to this route, not to the whole request,
  // exactly as on the node path
  ensureCancelState(context);

  return runCancelableHandler<Response>(
    handler,
    context.req.raw as unknown as IRequestLike,
    WEB_RESPONSE,
    options,
    call,
  );
}

function noop(): void {
  /**/
}
