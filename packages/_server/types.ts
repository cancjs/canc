import { CancelError, ICancelablePromiseFlagOptions } from '@cancjs/promise';

/**
 * A generator function standing in for a framework handler: it takes the handler's own parameter
 * tuple and returns a generator whose return value is the handler's result.
 *
 * Each package spells its framework generics once and derives both halves from the framework's own
 * handler type, which is what lets a bare `function* (req, res)` infer both parameters.
 */
export type TGeneratorFn<TFn extends (...args: any) => any, TReturn = unknown> = (
  ...args: Parameters<TFn>
) => Generator<unknown, TReturn>;

/** Either flavor a wrapper accepts: the generator form, or the framework's plain handler. */
export type THandlerFn<TFn extends (...args: any) => any, TReturn = unknown> = TGeneratorFn<TFn, TReturn> | TFn;

/**
 * Handler deadline. A number is the millisecond shorthand; the object form also carries the HTTP
 * status the error is stamped with and the message it reports.
 */
export type TTimeoutOption = number | { ms: number; status?: number; message?: string };

/**
 * Options a plugin, a middleware or a single route passes to the wrapper. Plugin-level options live
 * on the per-request holder and a route's own options are merged over them.
 */
export interface ICancelableHandlerOptions extends ICancelablePromiseFlagOptions {
  /** Handler deadline. A number is the millisecond shorthand. Composed into the same request signal. */
  timeout?: TTimeoutOption;
  /** Adopt or compose an external signal alongside the wired one. */
  signal?: AbortSignal | AbortSignal[];
  /** Called once when the client goes away. Cleanup and metrics only, the response is unreachable. */
  onDisconnect?: (reason: CancelError) => void;
  /** Called once when the deadline fires. The client is still connected. */
  onTimeout?: (reason: CancelError) => void;
}

/** Options for the opt-in error handler. */
export interface ICancelErrorHandlerOptions {
  /**
   * Status sent for a cancellation that carries none of its own.
   * Defaults to `503`.
   */
  status?: number;
}

/** Options for a graceful drain. */
export interface IDrainOptions {
  /** Grace window in milliseconds before the drain gives up waiting. Defaults to 10000. */
  timeout?: number;
  /** Reason the in-flight requests are canceled with. Defaults to the shutdown reason. */
  reason?: string;
  /** Whether to stop accepting new connections first. Gates every connection-closing call, not only the listener itself. Defaults to true. */
  closeServer?: boolean;
}

/** What a graceful drain reports once the grace window closes or every request has settled. */
export interface IDrainResult {
  canceled: number;
  completed: number;
  timedOut: boolean;
}

// Structural stand-ins for the node:http types, so nothing here depends on the ambient @types/node
// declarations and a framework's own wrapper types satisfy them as-is.

/** The part of an incoming request this layer reads. */
export interface IRequestLike {
  // left unknown and narrowed once in the holder: an object type here would be a weak type, and
  // node's own Socket declares none of its properties, so every adapter would need a cast to pass
  // a plain IncomingMessage in
  socket?: unknown;
}

/** The part of a server response this layer listens to. */
export interface IResponseLike {
  destroyed?: boolean;
  writableEnded?: boolean;
  once(event: string, listener: () => void): unknown;
}

/** The part of an http.Server a drain drives. */
export interface IServerLike {
  close?: (callback?: (error?: Error) => void) => unknown;
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
}
