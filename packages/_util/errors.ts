import { isObject } from './guards';

/**
 * Instance shape shared by every error class built here.
 */
export interface ICancError<TName extends string = string> extends Error {
  name: TName;
  message: string;
}

/**
 * Constructor shape {@link createErrorClass} produces. Each class below also declares a type alias
 * of the same name, so the exported name works in value and in type position.
 *
 * The return type omits brand properties to prevent index signature widening on bare `ICancErrorConstructor`.
 * Specific error classes (AbortError, TimeoutError) provide more precise types through their type aliases.
 */
export interface ICancErrorConstructor<TName extends string = string, _TBrand extends symbol = symbol> {
  readonly prototype: ICancError<TName>;
  new (message?: string): ICancError<TName>;
}

interface IDomExceptionConstructor {
  readonly prototype: object;
  new (message?: string, name?: string): ICancError;
}

// The lib set here is es2022 plus the node types, and neither declares DOMException. A local
// ambient declaration types the feature detect without pulling in the whole DOM library.
declare const DOMException: IDomExceptionConstructor | undefined;

const resolveMessage = (message: string | undefined, defaultMessage: string | undefined): string | undefined =>
  // Not `message || defaultMessage`: an explicit empty message stays empty.
  message === undefined ? defaultMessage : message;

function brandPrototype(prototype: object, brand: symbol): void {
  // Non-enumerable and non-writable by defineProperty default, which is what a brand wants.
  Object.defineProperty(prototype, brand, { value: true });
}

function defineQuietly(target: object, key: PropertyKey, value: unknown): void {
  try {
    Object.defineProperty(target, key, { value, configurable: true });
  } catch {
    // A non-configurable slot on an older engine. Cosmetic metadata is not worth a throw.
  }
}

// `class X extends DOMException` compiles down to `DOMException.call(this, ...)` under the es5
// target, and that throws "Illegal constructor". Reflect.construct is the portable way to get a
// DOMException-backed instance whose prototype chain still points at the subclass.
function createDomExceptionClass<TName extends string, TBrand extends symbol>(
  domException: IDomExceptionConstructor,
  name: TName,
  defaultMessage?: string,
): ICancErrorConstructor<TName, TBrand> {
  class DomExceptionBackedError {
    constructor(message?: string) {
      const target = new.target;
      const instance = Reflect.construct(
        domException,
        [resolveMessage(message, defaultMessage), name],
        target,
      ) as ICancError<TName>;

      if (Object.getPrototypeOf(instance) !== target.prototype) {
        Object.setPrototypeOf(instance, target.prototype);
      }

      return instance;
    }
  }

  Object.setPrototypeOf(DomExceptionBackedError.prototype, domException.prototype);

  return DomExceptionBackedError as unknown as ICancErrorConstructor<TName, TBrand>;
}

function createNativeErrorClass<TName extends string, TBrand extends symbol>(
  name: TName,
  defaultMessage?: string,
): ICancErrorConstructor<TName, TBrand> {
  class NativeErrorBackedError extends Error {
    name: TName;

    constructor(message?: string) {
      super(resolveMessage(message, defaultMessage));

      // The es5 output of `extends` loses the prototype link; restoring it is what keeps
      // `instanceof` working for this class and for anything subclassing it.
      Object.setPrototypeOf(this, new.target.prototype);
      this.name = name;
    }
  }

  return NativeErrorBackedError as unknown as ICancErrorConstructor<TName, TBrand>;
}

/**
 * Build an error class named `name`. It is backed by DOMException where the platform has one (so a
 * canc error and the DOMException the platform throws for the same condition are the same kind of
 * value), and by Error everywhere else. The two bases take different constructor arguments,
 * `(message, name)` against `(message)`, so the branches cannot share a constructor body.
 */
export function createErrorClass<TName extends string, TBrand extends symbol = symbol>(
  name: TName,
  brand?: TBrand,
  defaultMessage?: string,
): ICancErrorConstructor<TName, TBrand> {
  const domException =
    typeof DOMException !== 'undefined' && typeof Reflect !== 'undefined' && typeof Reflect.construct === 'function' ?
      DOMException
    : undefined;

  const ErrorClass =
    domException ?
      createDomExceptionClass<TName, TBrand>(domException, name, defaultMessage)
    : createNativeErrorClass<TName, TBrand>(name, defaultMessage);

  // The classes are built inside a factory, so their intrinsic name would otherwise be the local
  // one used above. Callers that match an error by constructor read this.
  defineQuietly(ErrorClass, 'name', name);

  if (brand !== undefined) {
    brandPrototype(ErrorClass.prototype, brand);
  }

  if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
    // defineProperty rather than assignment: DOMException.prototype exposes Symbol.toStringTag as
    // a getter with no setter, and assigning through it throws in strict mode.
    defineQuietly(ErrorClass.prototype, Symbol.toStringTag, name);
  }

  return ErrorClass;
}

/**
 * Prototype brand for AbortError instances, registered under `Symbol.for('@cancjs/promise:AbortError')`.
 */
export const ABORT_ERROR_BRAND = Symbol.for('@cancjs/promise:AbortError');

/**
 * Prototype brand for TimeoutError instances, registered under `Symbol.for('@cancjs/promise:TimeoutError')`.
 */
export const TIMEOUT_ERROR_BRAND = Symbol.for('@cancjs/promise:TimeoutError');

/**
 * Prototype brand for AggregateError shim instances, registered under `Symbol.for('@cancjs/promise:AggregateError')`.
 */
export const AGGREGATE_ERROR_BRAND = Symbol.for('@cancjs/promise:AggregateError');

/**
 * Prototype brand for SupersededError instances, registered under `Symbol.for('@cancjs/toolbox:SupersededError')`.
 */
export const SUPERSEDED_ERROR_BRAND = Symbol.for('@cancjs/toolbox:SupersededError');

/**
 * Rejected or thrown when an operation is aborted. Carries the same `name` as the DOMException a
 * real AbortSignal produces, so one code path handles both. Identified across realms by its
 * `Symbol.for('@cancjs/promise:AbortError')` prototype brand.
 */
export const AbortError = createErrorClass('AbortError', ABORT_ERROR_BRAND, 'The operation was aborted');
/** Instance type of {@link AbortError}. */
export type AbortError = InstanceType<typeof AbortError>;

/**
 * Rejected when a deadline elapses before the operation it guards settles. Identified across
 * realms by its `Symbol.for('@cancjs/promise:TimeoutError')` prototype brand.
 */
export const TimeoutError = createErrorClass(
  'TimeoutError',
  TIMEOUT_ERROR_BRAND,
  'The operation was aborted due to timeout',
);
/** Instance type of {@link TimeoutError}. */
export type TimeoutError = InstanceType<typeof TimeoutError>;

/**
 * Rejected when a debounced or throttled call is superseded by a later call before it settles.
 * On a cancelable promise implementation the wrapper promise is canceled instead, so this class
 * only ever surfaces from a non-cancelable (native-twin) implementation, where rejecting is the
 * only way to settle a call that will never run. Identified across realms by its
 * `Symbol.for('@cancjs/toolbox:SupersededError')` prototype brand.
 */
export const SupersededError = createErrorClass('SupersededError', SUPERSEDED_ERROR_BRAND, 'call superseded');
/** Instance type of {@link SupersededError}. */
export type SupersededError = InstanceType<typeof SupersededError>;

/**
 * Instance shape of {@link AggregateError}, platform class or shim alike.
 */
export interface IAggregateError extends Error {
  errors: any[];
}

/**
 * Constructor shape of {@link AggregateError}. The arguments differ from the other error classes
 * here, which is why this one is not built by {@link createErrorClass}.
 */
export interface IAggregateErrorConstructor {
  readonly prototype: IAggregateError;
  new (errors: any[], message?: string): IAggregateError;
}

class AggregateErrorShim extends Error {
  name: string;
  errors: any[];

  constructor(errors: any[], message?: string) {
    super(message);

    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'AggregateError';
    this.errors = errors;
  }
}

brandPrototype(AggregateErrorShim.prototype, AGGREGATE_ERROR_BRAND);

// Read off the global object instead of by bare identifier: this module exports its own
// `AggregateError` binding, and a bare reference would resolve to that binding rather than to the
// platform class.
function findPlatformAggregateError(): IAggregateErrorConstructor | undefined {
  const candidate =
    typeof globalThis === 'undefined' ? undefined : (
      (globalThis as unknown as { AggregateError?: unknown }).AggregateError
    );

  return typeof candidate === 'function' ? (candidate as unknown as IAggregateErrorConstructor) : undefined;
}

/**
 * The platform AggregateError where the engine has one (missing in older engines, for instance
 * pre-2021 QuickJS and Hermes), otherwise a shim shaped the same way. Only the shim is branded: a
 * builtin prototype is not ours to mutate, so platform instances are recognized by name.
 */
export const AggregateError: IAggregateErrorConstructor = findPlatformAggregateError() ?? AggregateErrorShim;
/** Instance type of {@link AggregateError}. */
export type AggregateError = IAggregateError;

/**
 * Construct an AggregateError instance wrapping an array of errors.
 */
export function createAggregateError(errors: any[], message?: string): IAggregateError {
  return new AggregateError(errors, message);
}

// Brand first, name second. The name fallback exists because the platform produces these three
// kinds itself (fetch, AbortSignal.timeout(), the builtin AggregateError) and an external producer
// cannot be branded. Errors that only canc produces are matched by brand alone.

/**
 * Whether value is an AbortError. Matches the `Symbol.for('@cancjs/promise:AbortError')` prototype brand or the `name` property, never `instanceof`.
 */
export const isAbortError = (error: any): error is AbortError =>
  isObject(error) && (error[ABORT_ERROR_BRAND] === true || error.name === 'AbortError');

/**
 * Whether value is a TimeoutError. Matches the `Symbol.for('@cancjs/promise:TimeoutError')` prototype brand or the `name` property, never `instanceof`.
 */
export const isTimeoutError = (error: any): error is TimeoutError =>
  isObject(error) && (error[TIMEOUT_ERROR_BRAND] === true || error.name === 'TimeoutError');

/**
 * Whether value is a SupersededError. No platform ever produces this kind, so unlike the guards
 * above there is no `name` to fall back on: matches the
 * `Symbol.for('@cancjs/toolbox:SupersededError')` prototype brand alone, never `instanceof`.
 */
export const isSupersededError = (error: any): error is SupersededError =>
  isObject(error) && error[SUPERSEDED_ERROR_BRAND] === true;

/**
 * Whether value is an AggregateError. Matches the `Symbol.for('@cancjs/promise:AggregateError')` prototype brand or the `name` property, never `instanceof`.
 */
export const isAggregateError = (error: any): error is AggregateError =>
  isObject(error) && (error[AGGREGATE_ERROR_BRAND] === true || error.name === 'AggregateError');
