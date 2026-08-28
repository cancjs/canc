import { CancelError, isCancelError } from '@cancjs/promise';

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

/** Narrows a framework's request object to the structural stand-in this layer reads. */
export function toRequestLike(req: unknown): IRequestLike {
  return req as IRequestLike;
}

/** Narrows a framework's response object to the structural stand-in this layer listens to. */
export function toResponseLike(res: unknown): IResponseLike {
  return res as IResponseLike;
}
