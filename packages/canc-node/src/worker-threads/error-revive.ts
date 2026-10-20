import { JsonParseError, NotImplementedError, ProcessExitError, ProcessSpawnError } from '@cancjs/node';
import { CancelError, TimeoutError } from '@cancjs/promise';

/** How far down a `cause` chain revival walks, so a cyclic or very deep cause cannot loop forever. */
const MAX_CAUSE_DEPTH = 8;

/**
 * Prototype of each canc-owned error kind a worker can throw, keyed by the brand key each one carries
 * on its prototype. Structured clone drops the prototype with the brand symbol, so the brand key that
 * the instance keeps as an own property is the only identity that survives the trip.
 */
const KIND_PROTOTYPES = new Map<string, object>(
  [CancelError, TimeoutError, ProcessExitError, ProcessSpawnError, JsonParseError, NotImplementedError].map((kind) => [
    (kind.prototype as { _cancErrorBrand?: string })._cancErrorBrand!,
    kind.prototype,
  ]),
);

/** A brand key shaped `@cancjs/<pkg>:<Name>`, the scheme every published canc class is keyed by. */
const BRAND_KEY_PATTERN = /^@cancjs\/[a-z-]+:([A-Za-z]+)$/;

/** Longest brand key revived as a generic class, so a hostile marker cannot grow the cache per byte. */
const MAX_GENERIC_KEY_LENGTH = 128;

/** Most generic prototypes kept, so a worker sending endless new keys cannot grow the cache forever. */
const MAX_GENERIC_PROTOTYPES = 64;

/**
 * One cached prototype per generic brand key, for a canc class this package does not ship (such as
 * `SupersededError` from `@cancjs/toolbox`). It is a plain `Error` subclass that carries the brand
 * symbol set to `true`, the shape the owning package's guard reads. Nothing is imported from there.
 */
const GENERIC_PROTOTYPES = new Map<string, object>();

/** The prototype a brand key revives onto, or `undefined` when the key is not a canc brand. */
function prototypeFor(key: string): object | undefined {
  const known = KIND_PROTOTYPES.get(key);
  if (known !== undefined) {
    return known;
  }
  const match = BRAND_KEY_PATTERN.exec(key);
  if (match === null || key.length > MAX_GENERIC_KEY_LENGTH) {
    return undefined;
  }
  let generic = GENERIC_PROTOTYPES.get(key);
  if (generic === undefined) {
    if (GENERIC_PROTOTYPES.size >= MAX_GENERIC_PROTOTYPES) {
      return undefined;
    }
    generic = Object.create(Error.prototype, {
      name: { value: match[1], writable: true, configurable: true },
      [Symbol.for(key)]: { value: true },
    }) as object;
    GENERIC_PROTOTYPES.set(key, generic);
  }
  return generic;
}

/** The brand key a worker error carries, or `undefined` when it is not a canc error. */
function brandKeyOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const key = (value as { _cancErrorBrand?: unknown })._cancErrorBrand;
  return typeof key === 'string' ? key : undefined;
}

/**
 * Rebuilds one error as the canc class its brand key names. Every own property is copied, including
 * the marker itself, so the revived value still answers the brand guards on the next hop.
 */
function reviveOne(error: object, depth: number): unknown {
  const key = brandKeyOf(error);
  const prototype = key === undefined ? undefined : prototypeFor(key);
  if (prototype === undefined) {
    return error;
  }

  const revived = Object.create(prototype) as Error;
  for (const key of Reflect.ownKeys(error)) {
    Object.defineProperty(revived, key, Object.getOwnPropertyDescriptor(error, key)!);
  }

  // nested canc error in `cause`: node's clone flattens it to a plain error
  if (depth < MAX_CAUSE_DEPTH && typeof revived.cause === 'object' && revived.cause !== null) {
    Object.defineProperty(revived, 'cause', {
      value: reviveDepth((revived as { cause: unknown }).cause, depth + 1),
      writable: true,
      configurable: true,
      enumerable: Object.prototype.propertyIsEnumerable.call(revived, 'cause'),
    });
  }
  return revived;
}

function reviveDepth(error: unknown, depth: number): unknown {
  if (typeof error !== 'object' || error === null || brandKeyOf(error) === undefined) {
    return error;
  }
  return reviveOne(error, depth);
}

/**
 * Rebuilds a worker's error on this side of the boundary as the canc class it was, so `isCancelError`
 * and the other brand guards answer for it again.
 *
 * Only an error carrying a canc brand key is rebuilt, and the key decides the class. A key this package
 * does not ship revives as a generic stand-in that the owning package's guard still recognizes.
 * A plain error, or a caller's own class that merely shares a canc name, carries no marker and comes
 * back unchanged. A `cause` chain is revived the same way, up to a fixed depth.
 *
 * @param error - The error node reported for the worker.
 * @returns The rebuilt canc error, or `error` itself when no revival applies.
 */
export function reviveWorkerError(error: unknown): unknown {
  return reviveDepth(error, 0);
}
