import { CancelError, isCancelError } from '@cancjs/promise';

import { IRequestCancelState } from './holder';
import { DEFAULT_TIMEOUT_STATUS, IStatusCancelError, STAMP_WINS } from './timeout';
import { IRequestLike, IResponseLike } from './types';

/**
 * The response members this family reads to decide what it can still do with a request.
 *
 * Structural rather than the ambient `http.ServerResponse`, so a framework's own reply wrapper
 * satisfies it as-is.
 */
export interface IResponseState {
  destroyed?: boolean;
  writable?: boolean;
  writableEnded?: boolean;
}

/**
 * Whether a response can still be answered.
 *
 * Two states put a response out of reach, and every adapter here needs both. One is a response
 * that already finished: the client has been told everything it is going to be told. The other is
 * a response whose socket died first. Code about to write a status cannot act on the difference,
 * so the question it has is this one, not which of the two happened. Reading a finished response
 * as live means writing to it anyway, which is how a late cancellation reached `reply.send` on a
 * reply fastify had already sent.
 *
 * The narrower question, whether the client went away, is `hasClientLeft`. Only the disconnect
 * wiring needs that one, because a response that finished normally is not a disconnect and must
 * not be reported as one.
 *
 * All three flags are read: a normal finish sets `writableEnded`, a socket that went away sets
 * `destroyed`, and `writable` covers a response that stopped taking writes without either. Reading
 * `writable` alone would not do. Measured on node 24.18.1 against raw http, express 5, koa 3,
 * fastify 5 and the hono node adapter, a response whose client left mid-handler reports destroyed
 * true, writableEnded false and writable true.
 */
export function isResponseLive(res: IResponseState): boolean {
  return res.writableEnded !== true && res.destroyed !== true && res.writable !== false;
}

/**
 * Whether the client went away before the response was finished.
 *
 * Deliberately narrower than the negation of `isResponseLive`: this is the guard that keeps a
 * completed response from being reported as a disconnect, which is why the request signal is wired
 * from the response rather than from the request.
 */
export function hasClientLeft(res: IResponseState): boolean {
  return res.writableEnded !== true && (res.destroyed === true || res.writable === false);
}

/**
 * Whether a cancellation surfaced on a response that can no longer be answered.
 *
 * The discriminator is the cancellation kind and the response state, never a message and never
 * `instanceof`. A deadline is excluded because it fires with the client still connected and is
 * meant to get a status back.
 */
export function isUnanswerable(error: unknown, res: IResponseState): boolean {
  return isCancelError(error) && !error.timedOut && !isResponseLive(res);
}

/** The HTTP status a cancellation carries, in either spelling, or the caller's fallback. */
export function statusOf(error: CancelError, fallback: number): number {
  const carried = error as CancelError & { status?: unknown; statusCode?: unknown };

  if (typeof carried.status === 'number') {
    return carried.status;
  }

  if (typeof carried.statusCode === 'number') {
    return carried.statusCode;
  }

  return fallback;
}

/**
 * The status a cancellation answers with in an adapter's handler, or `undefined` when the
 * cancellation carries no status at all.
 *
 * This reads the status only; it does not decide ownership. An unstamped cancellation (no status
 * on it) yields `undefined`, so the caller's own cancel, a timeout the handler raised on its own,
 * passes through untouched. A deadline's status and an explicit shutdown status both carry the
 * stamp that wins (`STAMP_WINS`), so the handler's `status` option cannot re-map them.
 * Otherwise the option applies, then 503. A status the caller set on its own cancellation reads as
 * a status like any other, so an owned one takes the option. Callers decide whether to answer at
 * all with `ownedStatusOf`, which checks ownership first.
 */
export function cancelStatusOf(error: CancelError, option: number | undefined): number | undefined {
  if (!statusStamped(error)) {
    return undefined;
  }

  if (stampWins(error)) {
    return statusOf(error, DEFAULT_TIMEOUT_STATUS);
  }

  return option ?? statusOf(error, DEFAULT_TIMEOUT_STATUS);
}

/**
 * The status an adapter answers an owned cancellation with, or `undefined` when the request does not
 * own it. Ownership comes from the request state, and the stamp is applied before the status is read,
 * so a status the error carries on its own never decides it.
 */
export function ownedStatusOf(
  error: unknown,
  state: IRequestCancelState,
  option: number | undefined,
  signals: readonly AbortSignal[] = [],
): number | undefined {
  if (!isCancelError(error) || cancelAttribution(error, state, signals) === undefined) {
    return undefined;
  }

  stampDerivedCancel(error, state, signals);

  return cancelStatusOf(error, option);
}

/** The route's own signals as a list, whichever shape `ICancelableHandlerOptions.signal` has. */
export function routeSignalsOf(signal: AbortSignal | AbortSignal[] | undefined): AbortSignal[] {
  if (signal === undefined) {
    return [];
  }

  return Array.isArray(signal) ? signal : [signal];
}

/** The headers a shutdown attached to its cancellation, or `undefined` when it attached none. */
export function cancelHeadersOf(error: CancelError): Record<string, string> | undefined {
  return (error as CancelError & { headers?: Record<string, string> }).headers;
}

/**
 * The headers to send with a cancellation answered at `option`. They come along only when the status
 * came from the error, the way express's finalhandler copies `err.headers` only for `err.status`: a
 * handler's `status` option that replaces the stamp leaves them behind, unless the stamp wins.
 */
export function cancelHeadersFor(error: CancelError, option: number | undefined): Record<string, string> | undefined {
  if (option !== undefined && !stampWins(error)) {
    return undefined;
  }

  return cancelHeadersOf(error);
}

/** Content headers a route may have set for its own body, which a cancellation answer must not keep. */
export const STALE_CONTENT_HEADERS = ['Content-Type', 'Content-Encoding', 'Content-Language', 'Content-Range'] as const;

/** What a request's cancellation is attributed to: the reason the request was canceled with. */
export interface IAttribution {
  reason: unknown;
}

/**
 * The request's own cancellation that a cancel belongs to, or `undefined` when the request did not
 * cancel it.
 *
 * A cancel is attributed when the request itself was canceled (a deadline, a shutdown, a
 * disconnect), or when one of the route's own signals aborted. Every other cancel is the caller's:
 * a user `cancel()` on a live request, or a timeout the handler raised on its own. The decision
 * reads the request's state and never the error's identity, so a cancel derived from the owned one
 * through a `{ signal }` or a child `.cancel()` is still attributed.
 */
export function cancelAttribution(
  error: unknown,
  state: IRequestCancelState,
  signals: readonly AbortSignal[] = [],
): IAttribution | undefined {
  if (!isCancelError(error)) {
    return undefined;
  }

  if (state.signal.aborted) {
    return { reason: state.signal.reason };
  }

  const own = [...signals, ...(state.routeSignals ?? [])].find((signal) => signal.aborted);

  return own ? { reason: own.reason } : undefined;
}

/**
 * Stamps an owned cancellation that carries no status yet with the status and headers of the
 * request's cancel, and marks it not exposed. A cancel the request does not own is left untouched.
 *
 * A derived cancel of a deadline keeps the deadline's status and its precedence over a handler
 * option. A route-signal cancel has no status of its own, so it answers 503 and the option applies.
 */
export function stampDerivedCancel(error: unknown, state: IRequestCancelState, signals?: readonly AbortSignal[]): void {
  if (!isCancelError(error) || statusStamped(error)) {
    return;
  }

  const attribution = cancelAttribution(error, state, signals);

  if (!attribution) {
    return;
  }

  const source =
    isCancelError(attribution.reason) && statusStamped(attribution.reason) ? attribution.reason : undefined;
  const status = source ? statusOf(source, DEFAULT_TIMEOUT_STATUS) : DEFAULT_TIMEOUT_STATUS;
  const stamped = error as IStatusCancelError;

  stamped.status = status;
  stamped.statusCode = status;
  stamped.expose = false;

  const headers = source ? cancelHeadersOf(source) : undefined;

  if (headers) {
    stamped.headers = { ...headers };
  }

  if (source && stampWins(source)) {
    Object.defineProperty(error, STAMP_WINS, { value: true });
  }
}

/** Whether the cancellation still carries a status on `status` or `statusCode`. */
function statusStamped(error: CancelError): boolean {
  const carried = error as CancelError & { status?: unknown; statusCode?: unknown };

  return typeof carried.status === 'number' || typeof carried.statusCode === 'number';
}

function stampWins(error: CancelError): boolean {
  return (error as unknown as Record<symbol, unknown>)[STAMP_WINS] === true;
}

/** Narrows a framework's request object to the structural stand-in this layer reads. */
export function toRequestLike(req: unknown): IRequestLike {
  return req as IRequestLike;
}

/** Narrows a framework's response object to the structural stand-in this layer listens to. */
export function toResponseLike(res: unknown): IResponseLike {
  return res as IResponseLike;
}
