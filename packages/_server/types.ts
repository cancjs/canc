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

/**
 * What a plain handler may return where the framework leaves the result open: anything except an
 * async generator. Nothing drains one, so the request would never be answered.
 */
export type TNonAsyncGeneratorResult =
  | void
  | null
  | undefined
  | string
  | number
  | boolean
  | symbol
  | bigint
  // a stream is async iterable but has no `next`, so it stays open; an async generator has both
  | (object & ({ next?: never } | { [Symbol.asyncIterator]?: never }));

/**
 * The framework's plain handler with an open result narrowed to `TNonAsyncGeneratorResult`. A
 * framework that already types its result keeps that type.
 */
export type TPlainHandlerFn<TFn extends (...args: any) => any> = (
  this: ThisParameterType<TFn>,
  ...args: Parameters<TFn>
) => [ReturnType<TFn>] extends [void] ? TNonAsyncGeneratorResult
: unknown extends ReturnType<TFn> ? TNonAsyncGeneratorResult
: ReturnType<TFn>;

/**
 * Either flavor a wrapper accepts: the generator form, or the framework's plain handler. An async
 * generator function is neither.
 */
export type THandlerFn<TFn extends (...args: any) => any, TReturn = unknown> =
  TGeneratorFn<TFn, TReturn> | TPlainHandlerFn<TFn>;

/**
 * Request deadline. A number is the millisecond shorthand; the object form also carries the HTTP
 * status the error is stamped with, the message it reports, and the headers the error answers with.
 */
export type TTimeoutOption =
  number | { ms: number; status?: number; message?: string; headers?: Record<string, string> };

/**
 * Options a plugin, a middleware or a single route passes to the wrapper. Plugin-level options live
 * on the per-request holder and a route's own options are merged over them.
 */
export interface ICancelableHandlerOptions extends ICancelablePromiseFlagOptions {
  /**
   * Request deadline, one per request. A number is the millisecond shorthand. Set on a plugin or
   * middleware it starts when that runs and covers every route behind it, plain ones included. Set
   * on a route it restarts the clock for that route, longer or shorter, and a value with no usable
   * limit lifts the inherited deadline. Firing aborts the request signal.
   *
   * It covers the handler, not the body: it ends once the wrapped handler answering the request
   * settles, so a stream piped out after the handler returned is not cut short. A response deadline
   * belongs to the server (`server.requestTimeout`) or the proxy in front of it.
   */
  timeout?: TTimeoutOption;
  /** Adopt or compose an external signal alongside the wired one. */
  signal?: AbortSignal | AbortSignal[];
  /**
   * Called once per request when the client goes away, however many layers passed it. Cleanup and
   * metrics only, the response is unreachable.
   */
  onDisconnect?: (reason: CancelError) => void;
  /** Called once per request when the deadline fires. The client is still connected. */
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

/** Options for a graceful shutdown. */
export interface IShutdownOptions {
  /**
   * Milliseconds from the start of the shutdown at which in-flight handlers are canceled with the
   * shutdown reason. Defaults to 10000, or 1000 before `closeAfter` when only `closeAfter` is set.
   * `0` cancels at the start, and a request arriving during the shutdown is canceled on arrival too.
   * Suits long-lived responses, such as server-sent events or long polling, that would otherwise hold
   * the whole window. A negative value is treated as 0.
   */
  cancelAfter?: number;
  /**
   * Milliseconds from the start of the shutdown after which the shutdown gives up waiting. Defaults to
   * 11000, or `cancelAfter` plus 1000 when only `cancelAfter` is set. Keep it within the pod's
   * termination grace period, less any preStop sleep and a margin. Throws a `RangeError` when
   * `cancelAfter` is greater than it.
   */
  closeAfter?: number;
  /** Reason the in-flight requests are canceled with. Defaults to the shutdown reason. */
  reason?: string;
  /**
   * Status a request this shutdown cancels answers with. Set, it beats a handler `status` option; left
   * unset, the handler option applies, then 503. A handler deadline keeps its own status either way.
   */
  status?: number;
  /** Headers added to the answer of each request this shutdown cancels, such as `Retry-After`. */
  headers?: Record<string, string>;
  /** Whether to stop accepting new connections first. Gates every connection-closing call, not only the listener itself. Defaults to true. */
  closeServer?: boolean;
}

/**
 * What a graceful shutdown reports once the window ends: every request and connection is done, or
 * `closeAfter` is reached.
 */
export interface IShutdownResult {
  /**
   * Requests this shutdown canceled: answered cleanly, client left, or force-closed after that.
   */
  canceled: number;
  /** Requests that finished normally and were not canceled by this shutdown. */
  completed: number;
  /**
   * `closeAfter` was reached with a request or connection still open, and was force-closed. A fired
   * `cancelAfter` alone does not set it.
   */
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

/** The part of an http.Server a shutdown drives. */
export interface IServerLike {
  close?: (callback?: (error?: Error) => void) => unknown;
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
}
