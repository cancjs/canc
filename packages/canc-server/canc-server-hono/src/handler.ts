import { CancelablePromise, CancelSignal, isCancelError } from '@cancjs/promise';
import type { Env, Handler, Input, MiddlewareHandler, TypedResponse } from 'hono';

import { IHandlerCall, runCancelableHandler } from '../../../_server/run';
import { ICancelableHandlerOptions, IRequestLike, IResponseLike, THandlerFn } from '../../../_server/types';
import { TAnyFn } from '../../../_util';
import { ensureCancelState, getNodeBindings, ICancelContext, isClientGone } from './bindings';

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

interface ISettleShim extends IResponseLike {
  close(): void;
}

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
 * The wrapper never writes the response. A cancellation whose client is already gone answers with
 * `499`, because hono has to be handed something; everything else, deadlines included, is thrown
 * on to whatever `app.onError` is mounted.
 */
export function cancelableHandler<E extends Env = any, P extends string = any, I extends Input = TBlankInput>(
  handler: THandlerFn<THonoHandler<E, P, I>, Response>,
  options?: ICancelableHandlerOptions,
): Handler<E, P, I, Promise<Response>> {
  return function cancelableRoute(c, next) {
    const context: ICancelContext = c;
    const { finish, task } = startTask(handler as TAnyFn, context, options, { args: [c, next] });

    return task.then(
      (response) => {
        finish();

        return response;
      },
      (error: unknown) => {
        finish();

        // the documented discriminator, never a message check and never instanceof: a deadline
        // still has a client to answer, a disconnect that outlived its socket has no addressee
        if (isCancelError(error) && !error.timedOut && isClientGone(context)) {
          return new Response(null, { status: CLIENT_CLOSED_STATUS });
        }

        throw error;
      },
    );
  };
}

/**
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
 * deadline or one `onDisconnect` hook covers a whole app.
 */
export function cancelMiddleware<E extends Env = any>(options?: ICancelableHandlerOptions): MiddlewareHandler<E> {
  return async function cancelMiddlewareRoute(c, next) {
    ensureCancelState(c, options);
    await next();
  };
}

function startTask(
  handler: TAnyFn,
  context: ICancelContext,
  options: ICancelableHandlerOptions | undefined,
  call: IHandlerCall,
): { finish: () => void; task: CancelablePromise<Response> } {
  const bindings = getNodeBindings(context.env);

  if (bindings) {
    return {
      finish: noop,
      task: runCancelableHandler<Response>(handler, bindings.incoming, bindings.outgoing, options, call),
    };
  }

  // installed before the shared server core reaches for it, so it finds the Web flavored state
  // instead of wiring the node one against a response that does not exist
  // options stay out of this call on purpose: they belong to this route, not to the whole request,
  // exactly as on the node path
  ensureCancelState(context);

  const shim = createSettleShim();

  return {
    finish: () => shim.close(),
    task: runCancelableHandler<Response>(handler, context.req.raw as unknown as IRequestLike, shim, options, call),
  };
}

// the shared server core hangs its teardown, the deadline timer and the abort listener and the live
// set, off the response close event, which only exists on node. A handler settling is that same
// moment on a Web runtime, so the listeners are collected here and called once when it does.
function createSettleShim(): ISettleShim {
  const listeners: (() => void)[] = [];
  let closed = false;

  return {
    close(): void {
      if (closed) {
        return;
      }

      closed = true;

      for (const listener of listeners) {
        listener();
      }
    },
    once(_event: string, listener: () => void): unknown {
      listeners.push(listener);

      return undefined;
    },
    writableEnded: false,
  };
}

function noop(): void {
  /**/
}
