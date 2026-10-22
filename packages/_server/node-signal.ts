import { CancelError, CancelSignal, createCancelSignal, isCancelError } from '@cancjs/promise';

import { hasClientLeft } from './exchange';
import { getRequestState, IRequestCancelState, setRequestState, trackRequest, untrackRequest } from './holder';
import { CLIENT_DISCONNECTED } from './reasons';
import { createTimeoutError, normalizeTimeout, startHandlerTimeout, stopHandlerTimeout } from './timeout';
import { ICancelableHandlerOptions, IRequestLike, IResponseLike } from './types';

/**
 * Installs the per-request cancel state, or returns the one already installed.
 *
 * Exactly one close listener exists per request no matter how many consumers ask for the signal,
 * which is the point of caching it: a route wrapper and a request-scoped database context share one
 * signal and one cancellation instead of racing two.
 *
 * Options passed here are the plugin or middleware level ones. They are merged into the holder so
 * every handler on the request inherits them; a route's own options are merged over them later. A
 * deadline among them starts now, so it covers the request whether or not a wrapped handler ever
 * runs, and lifecycle callbacks among them are wired once for the whole request.
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
      applyRequestOptions(existing, options);
    }

    return existing;
  }

  const { cancel, signal } = createCancelSignal();
  const state: IRequestCancelState = {
    cancel,
    live: new Set(),
    options: options ? { ...options } : {},
    response: res,
    signal,
  };

  setRequestState(req, state);
  trackRequest(req, state);
  wireDisconnect(req, res, state);

  if (options) {
    applyRequestOptions(state, options);
  }

  return state;
}

/**
 * Applies one layer's options to the request: its lifecycle callbacks join the ones already wired,
 * and a timeout it sets restarts the request deadline from now. A timeout with no usable value, an
 * infinite one included, clears the deadline instead, so a single route can opt out of the one its
 * router set.
 */
export function applyRequestOptions(state: IRequestCancelState, options: ICancelableHandlerOptions): void {
  adoptHooks(state, options);

  if (options.timeout !== undefined) {
    armRequestDeadline(state, options);
  }
}

/** Stops the request deadline. Tolerates a request that has none pending. */
export function stopRequestDeadline(state: IRequestCancelState): void {
  stopHandlerTimeout(state.timer);
  state.timer = undefined;
}

function armRequestDeadline(state: IRequestCancelState, options: ICancelableHandlerOptions): void {
  stopRequestDeadline(state);

  const spec = normalizeTimeout(options.timeout);

  // a closed response never emits close again, so a timer armed now would outlive the request
  if (!spec || state.signal.aborted || (state.response && isResponseClosed(state.response))) {
    return;
  }

  state.timer = startHandlerTimeout(spec.ms, () => {
    state.timer = undefined;
    // the deadline aborts the request signal itself rather than the handler's promise, so
    // request-scoped work other consumers started stops with the handler instead of outliving it
    state.cancel(createTimeoutError(spec));
  });
}

function adoptHooks(state: IRequestCancelState, { onDisconnect, onTimeout }: ICancelableHandlerOptions): void {
  if (!onDisconnect && !onTimeout) {
    return;
  }

  const wired = state.hooks !== undefined;
  const hooks = state.hooks ?? {};

  if (onDisconnect) hooks.onDisconnect = onDisconnect;
  if (onTimeout) hooks.onTimeout = onTimeout;

  // one listener per request however many layers bring callbacks, read when the signal aborts
  if (wired) {
    return;
  }

  state.hooks = hooks;

  if (state.signal.aborted) {
    reportCancel(state);

    return;
  }

  state.signal.addEventListener('abort', () => reportCancel(state), { once: true });
}

function reportCancel(state: IRequestCancelState): void {
  // a shutdown cancels the signal to reach the consumers a handler never awaited, and neither
  // callback reports that: the client has not left and no deadline was missed
  if (state.shuttingDown) {
    return;
  }

  // the documented discriminator, never a message check: the request signal always aborts with a
  // CancelError, so anything else came from a foreign signal and reads as a disconnect
  const reason = state.signal.reason;

  if (isCancelError(reason) && reason.timedOut) {
    state.hooks?.onTimeout?.(reason);
  } else {
    state.hooks?.onDisconnect?.(reason as CancelError);
  }
}

/**
 * Whether a response already emitted its close event. Anything wired after that point waits on an
 * event that never comes again.
 */
export function isResponseClosed(res: IResponseLike): boolean {
  return (res as IResponseLike & { closed?: unknown }).closed === true;
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
  if (hasClientLeft(res)) {
    untrackRequest(req, state);
    state.cancel(CLIENT_DISCONNECTED);

    return;
  }

  // installed late, from a hook running after the response closed: a finished exchange keeps an
  // inert signal and stays out of the server registry, which it would otherwise pin for good
  if (isResponseClosed(res)) {
    untrackRequest(req, state);

    return;
  }

  // once, so the listener count per response stays bounded without a settle hook to remove it
  res.once('close', () => {
    untrackRequest(req, state);
    stopRequestDeadline(state);

    if (hasClientLeft(res)) {
      state.cancel(CLIENT_DISCONNECTED);
    }
  });
}
