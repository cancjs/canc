import { JsonParseError, NotImplementedError, ProcessExitError, ProcessSpawnError } from '@cancjs/node';
import { CancelError, TimeoutError } from '@cancjs/promise';

/**
 * Prototype of each canc-owned error kind a worker can throw, keyed by the `name` node keeps across
 * the thread boundary. Structured clone drops the prototype, and with it the brand that guards read,
 * so the name is the only identity that survives the trip.
 */
const KIND_PROTOTYPES = new Map<string, object>([
  ['CancelError', CancelError.prototype],
  ['TimeoutError', TimeoutError.prototype],
  ['ProcessExitError', ProcessExitError.prototype],
  ['ProcessSpawnError', ProcessSpawnError.prototype],
  ['JsonParseError', JsonParseError.prototype],
  ['NotImplementedError', NotImplementedError.prototype],
]);

/** A plain `Error` as node reports it, from any realm: its constructor is `Error`, not a subclass. */
function isPlainError(value: unknown): value is Error {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const constructor = (value as { constructor?: { name?: unknown } }).constructor;
  return constructor?.name === 'Error';
}

/**
 * Rebuilds a worker's error on this side of the boundary as the canc class it was, so `isCancelError`
 * and the other brand guards answer for it again.
 *
 * Only a plain `Error` whose `name` is one of the kinds above is rebuilt, which is what node hands
 * over for a thrown canc error. Every own property survives the copy (message, stack, code, cause,
 * `exitCode`, ...). Anything else is returned unchanged, including a caller's own error class that
 * happens to share a name, since its constructor is not `Error`.
 *
 * @param error - The error node reported for the worker.
 * @returns The rebuilt canc error, or `error` itself when no revival applies.
 */
export function reviveWorkerError(error: unknown): unknown {
  // checked by constructor name rather than `instanceof Error`: the thread's Error can come from
  // another realm (a vm context, a test runner's sandbox), where `instanceof` answers no
  if (!isPlainError(error)) {
    return error;
  }

  const prototype = KIND_PROTOTYPES.get(error.name);
  if (prototype === undefined) {
    return error;
  }

  const revived = Object.create(prototype) as Error;
  for (const key of Reflect.ownKeys(error)) {
    Object.defineProperty(revived, key, Object.getOwnPropertyDescriptor(error, key)!);
  }
  return revived;
}
