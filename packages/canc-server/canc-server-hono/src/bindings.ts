import { isResponseLive } from '../../../_server/exchange';
import { getRequestState, IRequestCancelState, setRequestState } from '../../../_server/holder';
import { ensureRequestCancelState } from '../../../_server/node-signal';
import { ICancelableHandlerOptions, IRequestLike, IResponseLike } from '../../../_server/types';
import { createWebRequestSignal } from '../../../_server/web-signal';

/**
 * The part of a hono `Context` this package reads.
 *
 * Structural on purpose. A hono context carries three type parameters, and a route that narrows any
 * of them still satisfies this shape, so no call site has to spell them out or cast.
 */
export interface ICancelContext {
  env: unknown;
  req: { raw: Request };
}

/** The node request and response `@hono/node-server` publishes on `c.env`. */
export interface INodeBindings {
  incoming: IRequestLike;
  outgoing: IResponseLike;
}

interface INodeBindingsLike {
  incoming?: unknown;
  outgoing?: { on?: unknown } | null;
}

/**
 * The node request and response behind the current request, or undefined on a Web standard runtime.
 *
 * Presence of the node response is the whole signal, which is the same posture the rest of this
 * repository takes with documented runtime globals: the read happens off a typed local rather than
 * a bare identifier, and nothing is compared against a particular value. `@hono/node-server` is the
 * only adapter that publishes this pair, so no other runtime answers to the shape by accident.
 */
export function getNodeBindings(env: unknown): INodeBindings | undefined {
  const bindings = env as INodeBindingsLike | null | undefined;
  const incoming = bindings?.incoming;
  const outgoing = bindings?.outgoing;

  if (!incoming || !outgoing || typeof outgoing.on !== 'function') {
    return undefined;
  }

  return { incoming: incoming as IRequestLike, outgoing: outgoing as unknown as IResponseLike };
}

/**
 * Installs the request cancel state on either runtime, or returns the one already installed.
 *
 * On node the state is keyed on the raw `IncomingMessage`, so a route, a request scoped database
 * context and anything else asking for the signal share one listener and one cancellation.
 */
export function ensureCancelState(c: ICancelContext, options?: ICancelableHandlerOptions): IRequestCancelState {
  const bindings = getNodeBindings(c.env);

  if (bindings) {
    return ensureRequestCancelState(bindings.incoming, bindings.outgoing, options);
  }

  return ensureWebRequestState(c.req.raw, options);
}

/**
 * Whether this request can still be answered.
 *
 * The node branch reads the raw response rather than the request, on the same predicate the rest
 * of the family uses. A Web runtime has no response object to read, so the request signal is the
 * only evidence there, and it reports the client leaving rather than the response finishing.
 */
export function isResponseUnreachable(c: ICancelContext): boolean {
  const bindings = getNodeBindings(c.env);

  if (!bindings) {
    // unlike its node namesakes this signal does mean the client went away
    return c.req.raw.signal?.aborted === true;
  }

  return !isResponseLive(bindings.outgoing);
}

function ensureWebRequestState(request: Request, options?: ICancelableHandlerOptions): IRequestCancelState {
  // the holder takes structural stand-ins rather than the ambient node types, and a Web Request
  // satisfies them, so the same cache works for a runtime that has no IncomingMessage at all
  const keyed = request as unknown as IRequestLike;
  const existing = getRequestState(keyed);

  if (existing) {
    if (options) {
      existing.options = { ...existing.options, ...options };
    }

    return existing;
  }

  // signals from the options are deliberately left out here: the shared server core composes
  // them into the handler's own promise on both runtimes, and folding them in twice would let an
  // external signal cancel the whole request state on the Web path while canceling only the task
  // on node
  const { cancel, signal } = createWebRequestSignal(request);
  const state: IRequestCancelState = { cancel, live: new Set(), options: options ? { ...options } : {}, signal };

  setRequestState(keyed, state);

  // nothing is tracked for a shutdown here: the live registry hangs off the node server a request
  // arrived on, and a Web runtime has no such object
  return state;
}
