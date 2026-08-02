import { isObject } from './index';

/**
 * Instance shape shared by every error class built here.
 */
export interface ICancError extends Error {
  name: string;
  message: string;
}

/**
 * Constructor shape {@link createErrorClass} produces. Each class below also declares a type alias
 * of the same name, so the exported name works in value and in type position.
 */
export interface ICancErrorConstructor {
  readonly prototype: ICancError;
  new (message?: string): ICancError;
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
function createDomExceptionClass(
  domException: IDomExceptionConstructor,
  name: string,
  defaultMessage?: string,
): ICancErrorConstructor {
  class DomExceptionBackedError {
    constructor(message?: string) {
      const target = new.target;
      const instance = Reflect.construct(
        domException,
        [resolveMessage(message, defaultMessage), name],
        target,
      ) as ICancError;

      if (Object.getPrototypeOf(instance) !== target.prototype) {
        Object.setPrototypeOf(instance, target.prototype);
      }

      return instance;
    }
  }

  Object.setPrototypeOf(DomExceptionBackedError.prototype, domException.prototype);

  return DomExceptionBackedError as unknown as ICancErrorConstructor;
}

function createNativeErrorClass(name: string, defaultMessage?: string): ICancErrorConstructor {
  class NativeErrorBackedError extends Error {
    name: string;

    constructor(message?: string) {
      super(resolveMessage(message, defaultMessage));

      // The es5 output of `extends` loses the prototype link; restoring it is what keeps
      // `instanceof` working for this class and for anything subclassing it.
      Object.setPrototypeOf(this, new.target.prototype);
      this.name = name;
    }
  }

  return NativeErrorBackedError;
}

/**
 * Build an error class named `name`. It is backed by DOMException where the platform has one (so a
 * canc error and the DOMException the platform throws for the same condition are the same kind of
 * value), and by Error everywhere else. The two bases take different constructor arguments,
 * `(message, name)` against `(message)`, so the branches cannot share a constructor body.
 */
export function createErrorClass(name: string, defaultMessage?: string): ICancErrorConstructor {
  const domException =
    typeof DOMException !== 'undefined' && typeof Reflect !== 'undefined' && typeof Reflect.construct === 'function' ?
      DOMException
    : undefined;

  const ErrorClass =
    domException ?
      createDomExceptionClass(domException, name, defaultMessage)
    : createNativeErrorClass(name, defaultMessage);

  // The classes are built inside a factory, so their intrinsic name would otherwise be the local
  // one used above. Callers that match an error by constructor read this.
  defineQuietly(ErrorClass, 'name', name);

  if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
    // defineProperty rather than assignment: DOMException.prototype exposes Symbol.toStringTag as
    // a getter with no setter, and assigning through it throws in strict mode.
    defineQuietly(ErrorClass.prototype, Symbol.toStringTag, name);
  }

  return ErrorClass;
}

export const ABORT_ERROR_BRAND = Symbol.for('@cancjs/promise:AbortError');
export const TIMEOUT_ERROR_BRAND = Symbol.for('@cancjs/promise:TimeoutError');
export const AGGREGATE_ERROR_BRAND = Symbol.for('@cancjs/promise:AggregateError');

/**
 * Rejected or thrown when an operation is aborted. Carries the same `name` as the DOMException a
 * real AbortSignal produces, so one code path handles both.
 */
export const AbortError = createErrorClass('AbortError', 'The operation was aborted');
export type AbortError = ICancError;

/**
 * Rejected when a deadline elapses before the operation it guards settles.
 */
export const TimeoutError = createErrorClass('TimeoutError', 'The operation was aborted due to timeout');
export type TimeoutError = ICancError;

brandPrototype(AbortError.prototype, ABORT_ERROR_BRAND);
brandPrototype(TimeoutError.prototype, TIMEOUT_ERROR_BRAND);

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
export type AggregateError = IAggregateError;

export function createAggregateError(errors: any[], message?: string): IAggregateError {
  return new AggregateError(errors, message);
}

// Brand first, name second. The name fallback is here because the platform produces these three
// kinds itself (fetch, AbortSignal.timeout(), the builtin AggregateError) and a producer we did not
// write cannot be branded. Errors that only canc produces are matched by brand alone.
export const isAbortError = (error: any): error is AbortError =>
  isObject(error) && (error[ABORT_ERROR_BRAND] === true || error.name === 'AbortError');

export const isTimeoutError = (error: any): error is TimeoutError =>
  isObject(error) && (error[TIMEOUT_ERROR_BRAND] === true || error.name === 'TimeoutError');

export const isAggregateError = (error: any): error is AggregateError =>
  isObject(error) && (error[AGGREGATE_ERROR_BRAND] === true || error.name === 'AggregateError');
