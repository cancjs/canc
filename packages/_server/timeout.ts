import { CancelError, TimeoutError } from '@cancjs/promise';

import { HANDLER_TIMEOUT } from './reasons';
import { TTimeoutOption } from './types';

/** Status stamped on a deadline error when the caller names none. */
export const DEFAULT_TIMEOUT_STATUS = 503;

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
 * timeout needs no branch at the call site.
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
    ms,
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

/** Schedules the deadline, returning the handle that stops it. */
export function startHandlerTimeout(ms: number, onDeadline: () => void): unknown {
  // plain setTimeout is right here: a request deadline is seconds, nowhere near the 32-bit
  // millisecond ceiling where a single timer wraps and fires at once, so the chunked-timer
  // machinery the toolbox needs for long waits buys nothing and costs a dependency
  return setTimeout(onDeadline, ms);
}

/** Stops a scheduled deadline. Tolerates a handle that was never armed. */
export function stopHandlerTimeout(timer: unknown): void {
  if (timer !== undefined) {
    clearTimeout(timer as ReturnType<typeof setTimeout>);
  }
}
