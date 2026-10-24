import { CancelError, TimeoutError } from '@cancjs/promise';

import { HANDLER_TIMEOUT } from './reasons';
import { TTimeoutOption } from './types';

/** Status stamped on a deadline error when the caller names none. */
export const DEFAULT_TIMEOUT_STATUS = 503;

/** Longest delay one timer holds. A larger value makes the runtime fire the timer after a millisecond. */
export const MAX_TIMER_MS = 2 ** 31 - 1;

/** A handler deadline with every default already resolved. */
export interface ITimeoutSpec {
  ms: number;
  status: number;
  message: string;
  headers?: Record<string, string>;
}

/** A cancellation carrying the HTTP status a framework error handler reads off it. */
export interface IStatusCancelError extends CancelError {
  status: number;
  statusCode: number;
  /**
   * Headers the cancel answers with: a shutdown's, or a deadline's from its timeout option. Absent
   * otherwise.
   */
  headers?: Record<string, string>;
  /** Always false on a canc-minted cancel: its message is for the log, never for the response body. */
  expose: boolean;
}

/**
 * Marks a shutdown cancel whose status the caller did not set. Keyed in the `@cancjs/server-node:`
 * namespace so every copy of this module reads the same mark.
 */
export const DEFAULT_SHUTDOWN_STATUS = Symbol.for('@cancjs/server-node:defaultShutdownStatus');

/**
 * Marks a cancellation whose status is the deadline's or an explicit shutdown's. That status beats a
 * handler's `status` option; a status the caller set on its own error does not.
 */
export const STAMP_WINS = Symbol.for('@cancjs/server-node:stampWins');

/** What a shutdown sets on the cancel it raises on each request. */
export interface IShutdownErrorOptions {
  status?: number;
  headers?: Record<string, string>;
}

/**
 * Resolves the shorthand and the object form of the deadline option into one shape.
 *
 * Returns undefined where there is no usable deadline, including an infinite one, so an optional
 * timeout needs no branch at the call site. A finite duration past the timer ceiling is clamped to
 * it, and zero stays an immediate deadline.
 */
export function normalizeTimeout(option?: TTimeoutOption): ITimeoutSpec | undefined {
  if (option === undefined || option === null) {
    return undefined;
  }

  const spec = typeof option === 'number' ? { ms: option } : option;
  const { ms } = spec;

  if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) {
    return undefined;
  }

  const { headers } = spec as { headers?: Record<string, string> };

  return {
    message: (spec as { message?: string }).message ?? HANDLER_TIMEOUT,
    ms: Math.min(ms, MAX_TIMER_MS),
    status: (spec as { status?: number }).status ?? DEFAULT_TIMEOUT_STATUS,
    ...(headers ? { headers: { ...headers } } : {}),
  };
}

/**
 * Mints the cancellation a missed deadline raises.
 *
 * The cause is a TimeoutError, which is what makes `timedOut` true and separates a deadline from a
 * client disconnect without reading the message. Both `status` and `statusCode` are stamped on it:
 * express reads `status` then `statusCode`, fastify does the same, and koa reads `status`, so
 * setting both produces the configured code in all three with no extra wiring.
 */
export function createTimeoutError(spec: ITimeoutSpec): IStatusCancelError {
  const error = new CancelError(spec.message, { cause: new TimeoutError(spec.message) }) as IStatusCancelError;

  error.status = spec.status;
  error.statusCode = spec.status;
  error.expose = false;
  if (spec.headers) {
    error.headers = { ...spec.headers };
  }
  Object.defineProperty(error, STAMP_WINS, { value: true });

  return error;
}

/**
 * Mints the cancellation a shutdown raises on one request.
 *
 * Stamped with the same status pair as a deadline, so a framework's default error pipeline answers
 * 503 with no handler. The cause is left empty: `timedOut` stays false, and the handler's status
 * option still applies to it, unless the shutdown set a status of its own.
 */
export function createShutdownError(message: string, options: IShutdownErrorOptions = {}): IStatusCancelError {
  const error = new CancelError(message) as IStatusCancelError;
  const status = options.status ?? DEFAULT_TIMEOUT_STATUS;

  error.status = status;
  error.statusCode = status;
  error.expose = false;
  if (options.headers) {
    error.headers = { ...options.headers };
  }
  if (options.status === undefined) {
    Object.defineProperty(error, DEFAULT_SHUTDOWN_STATUS, { value: true });
  } else {
    Object.defineProperty(error, STAMP_WINS, { value: true });
  }

  return error;
}

/** Schedules the deadline, returning the handle that stops it. */
export function startHandlerTimeout(ms: number, onDeadline: () => void): unknown {
  // plain setTimeout: normalizeTimeout already clamped ms to the 32-bit ceiling, so the chunked
  // timers the toolbox uses for long waits would only add a dependency
  return setTimeout(onDeadline, ms);
}

/** Stops a scheduled deadline. Tolerates a handle that was never armed. */
export function stopHandlerTimeout(timer: unknown): void {
  if (timer !== undefined) {
    clearTimeout(timer as ReturnType<typeof setTimeout>);
  }
}
