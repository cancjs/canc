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
}

/** A cancellation carrying the HTTP status a framework error handler reads off it. */
export interface IStatusCancelError extends CancelError {
  status: number;
  statusCode: number;
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

  return {
    message: (spec as { message?: string }).message ?? HANDLER_TIMEOUT,
    ms: Math.min(ms, MAX_TIMER_MS),
    status: (spec as { status?: number }).status ?? DEFAULT_TIMEOUT_STATUS,
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

  return error;
}

/**
 * Mints the cancellation a shutdown raises on one request.
 *
 * Stamped with the same status pair as a deadline, so a framework's default error pipeline answers
 * 503 with no handler. The cause is left empty: `timedOut` stays false, and the handler's status
 * option still applies to it.
 */
export function createShutdownError(message: string): IStatusCancelError {
  const error = new CancelError(message) as IStatusCancelError;

  error.status = DEFAULT_TIMEOUT_STATUS;
  error.statusCode = DEFAULT_TIMEOUT_STATUS;

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
