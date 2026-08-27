import { CancelSignal, createCancelSignal } from '@cancjs/promise';

import { getRequestState, IRequestCancelState, setRequestState, trackRequest, untrackRequest } from './holder';
import { CLIENT_DISCONNECTED } from './reasons';
import { ICancelableHandlerOptions, IRequestLike, IResponseLike } from './types';

/**
 * Installs the per-request cancel state, or returns the one already installed.
 *
 * Exactly one close listener exists per request no matter how many consumers ask for the signal,
 * which is the point of caching it: a route wrapper and a request-scoped database context share one
 * signal and one cancellation instead of racing two.
 *
 * Options passed here are the plugin or middleware level ones. They are merged into the holder so
 * every handler on the request inherits them; a route's own options are merged over them later.
 */
export function ensureRequestCancelState(
  req: IRequestLike,
  res: IResponseLike,
  options?: ICancelableHandlerOptions,
): IRequestCancelState {
  const existing = getRequestState(req);
  if (existing) {
    if (options) {
      existing.options = { ...existing.options, ...options };
    }

    return existing;
  }

  const { cancel, signal } = createCancelSignal();
  const state: IRequestCancelState = {
    cancel,
    live: new Set(),
    options: options ? { ...options } : {},
    signal,
  };

  setRequestState(req, state);
  trackRequest(req, state);
  wireDisconnect(req, res, state);

  return state;
}

/** The cancel signal for a request, installing and wiring it on first use. */
export function getNodeRequestSignal(
  req: IRequestLike,
  res: IResponseLike,
  options?: ICancelableHandlerOptions,
): CancelSignal {
  return ensureRequestCancelState(req, res, options).signal;
}

function wireDisconnect(req: IRequestLike, res: IResponseLike, state: IRequestCancelState): void {
  // wired from the response, never the request: IncomingMessage 'close' means the request STREAM
  // completed, so a body-carrying POST behind a body parser fires it at t=0 with the client still
  // connected, and every such request would be canceled on arrival
  //
  // ServerResponse 'close' means the response completed OR the connection died early, and
  // !writableEnded is the only guard separating those two, correct in all 8 scenarios measured on
  // node 24 against raw http, express 5 and fastify 5
  //
  // platform request signals carry the same defect and are deliberately not adopted: node core's
  // IncomingMessage.prototype.signal is once('close', abort) with no guard, fastify's
  // request.signal is raw.on('close', onAbort), measured aborting 1ms into a POST handler with the
  // socket still alive
  //
  // an external signal is adopted only through the explicit signal option
  // the pre-flight reads the response too, never req.destroyed, for the same reason the listener
  // does: a fully consumed request stream auto-destroys itself, so on a body-carrying POST
  // req.destroyed flips true one microtask after the body parser finishes, with the socket still
  // open (measured on node 24.18.1 with express 5.2.1: req.destroyed=true, socket.destroyed=false,
  // res.destroyed=false). anything installing the signal later than the same tick as the route,
  // a nest interceptor for one, would cancel every such request on arrival
  //
  // res.destroyed with !writableEnded is the pair that separates the two: a client that really
  // left reports both destroyed, a healthy request reports neither
  if (isAlreadyGone(res)) {
    untrackRequest(req, state);
    state.cancel(CLIENT_DISCONNECTED);

    return;
  }

  // once, so the listener count per response stays bounded without a settle hook to remove it
  res.once('close', () => {
    untrackRequest(req, state);

    if (!res.writableEnded) {
      state.cancel(CLIENT_DISCONNECTED);
    }
  });
}

function isAlreadyGone(res: IResponseLike): boolean {
  return res.destroyed === true && res.writableEnded !== true;
}
