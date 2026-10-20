import { isObject } from './guards';

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
 *
 * Type-level identity rests on the brand key, the string the factory stores as `_cancErrorBrand`
 * on the prototype next to the registry symbol, not on `name`. Two classes sharing a name are still
 * distinct types, and a subclass stays free to rename itself, which a literal `name` would forbid.
 * The key is a string literal rather than the symbol because every package inlines its own copy of
 * these classes, and a string literal is the same type in every copy while a `unique symbol` is not.
 * `TBrand` defaults to `never`, so the bare form drops the brand member instead of widening it.
 */
export interface ICancErrorConstructor<TName extends string = string, TBrand extends string = never> {
  readonly name: TName;
  readonly prototype: ICancError;
  new (message?: string): ICancError & { readonly [K in TBrand as '_cancErrorBrand']: K };
}

interface IDomExceptionConstructor {
  readonly prototype: object;
  new (message?: string, name?: string): ICancError;
}

// DOMException is missing from the lib set; a local ambient declaration types it.
declare const DOMException: IDomExceptionConstructor | undefined;

const resolveMessage = (message: string | undefined, defaultMessage: string | undefined): string | undefined =>
  // Not `message || defaultMessage`: an explicit empty message stays empty.
  message === undefined ? defaultMessage : message;

function brandPrototype(prototype: object, brand: symbol, key?: string): void {
  // Non-enumerable and non-writable by defineProperty default, which is what a brand wants.
  Object.defineProperty(prototype, brand, { value: true });

  if (key !== undefined) {
    Object.defineProperty(prototype, '_cancErrorBrand', { value: key });
  }
}

// Own and non-enumerable, so inspect and JSON skip it while a worker thread still carries it over.
// Node's worker error path keeps own string-keyed non-enumerable props only.
function markInstance(instance: object, brand: string | undefined): void {
  if (brand !== undefined) {
    Object.defineProperty(instance, '_cancErrorBrand', { value: brand, configurable: true });
  }
}

function defineQuietly(target: object, key: PropertyKey, value: unknown): void {
  try {
    Object.defineProperty(target, key, { value, configurable: true });
  } catch {
    // Older engines may leave the slot non-configurable; the metadata is not worth a throw.
  }
}

// Non-enumerable like the accessor it shadows, but writable
function defineWritable(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
}

// `class X extends DOMException` compiles down to `DOMException.call(this, ...)` under the es5
// target, and that throws "Illegal constructor". Reflect.construct is the portable way to get a
// DOMException-backed instance whose prototype chain still points at the subclass.
function createDomExceptionClass<TName extends string, TBrand extends string>(
  domException: IDomExceptionConstructor,
  name: TName,
  defaultMessage?: string,
  brand?: TBrand,
): ICancErrorConstructor<TName, TBrand> {
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

      // DOMException exposes both as getter-only accessors, so plain assignment would throw
      defineWritable(instance, 'name', instance.name);
      defineWritable(instance, 'message', instance.message);
      markInstance(instance, brand);

      return instance;
    }
  }

  Object.setPrototypeOf(DomExceptionBackedError.prototype, domException.prototype);

  return DomExceptionBackedError as unknown as ICancErrorConstructor<TName, TBrand>;
}

function createNativeErrorClass<TName extends string, TBrand extends string>(
  name: TName,
  defaultMessage?: string,
  brand?: TBrand,
): ICancErrorConstructor<TName, TBrand> {
  class NativeErrorBackedError extends Error {
    name: string;

    constructor(message?: string) {
      super(resolveMessage(message, defaultMessage));

      // The es5 output of `extends` loses the prototype link; restoring it is what keeps
      // `instanceof` working for this class and for anything subclassing it.
      Object.setPrototypeOf(this, new.target.prototype);
      this.name = name;
      markInstance(this, brand);
    }
  }

  return NativeErrorBackedError as unknown as ICancErrorConstructor<TName, TBrand>;
}

/**
 * Build an error class named `name`. It is backed by DOMException where the platform has one (so a
 * canc error and the DOMException the platform throws for the same condition are the same kind of
 * value), and by Error everywhere else. The two bases take different constructor arguments,
 * `(message, name)` against `(message)`, so the branches cannot share a constructor body.
 *
 * `brand` is a registry key. The prototype gets `Symbol.for(brand)`, which the guards test, and
 * `_cancErrorBrand` holding the key itself, which the instance type references.
 */
export function createErrorClass<TName extends string, TBrand extends string = never>(
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
      createDomExceptionClass<TName, TBrand>(domException, name, defaultMessage, brand)
    : createNativeErrorClass<TName, TBrand>(name, defaultMessage, brand);

  // The factory-built classes would keep the local name otherwise; constructor matching reads this.
  defineQuietly(ErrorClass, 'name', name);

  if (brand !== undefined) {
    brandPrototype(ErrorClass.prototype, Symbol.for(brand), brand);
  }

  if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
    // defineProperty, not assignment: DOMException's toStringTag getter throws on set.
    // 'Error', not the class name: a tag of its own makes canc kinds arrive as plain Error.
    defineQuietly(ErrorClass.prototype, Symbol.toStringTag, 'Error');
  }

  return ErrorClass;
}

// Subclassing to add own data properties requires re-parenting off DOMException.prototype
export function wirePrototype<TBase extends Error, TSub extends new (...args: any[]) => TBase>(
  subClass: TSub,
  baseClass: abstract new (...args: any[]) => TBase,
): TSub {
  if (typeof Object.setPrototypeOf === 'function') {
    Object.setPrototypeOf(subClass.prototype, baseClass.prototype);
  }

  return subClass;
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
 * Prototype brand for IterationError instances, registered under `Symbol.for('@cancjs/coroutine:IterationError')`.
 */
export const ITERATION_ERROR_BRAND = Symbol.for('@cancjs/coroutine:IterationError');

/**
 * Rejected or thrown when an operation is aborted. Carries the same `name` as the DOMException a
 * real AbortSignal produces, so one code path handles both. Identified across realms by its
 * `Symbol.for('@cancjs/promise:AbortError')` prototype brand.
 */
export const AbortError = createErrorClass('AbortError', '@cancjs/promise:AbortError', 'The operation was aborted');
/** Instance type of {@link AbortError}. */
export type AbortError = InstanceType<typeof AbortError>;

/**
 * Rejected when a deadline elapses before the operation it guards settles. Identified across
 * realms by its `Symbol.for('@cancjs/promise:TimeoutError')` prototype brand.
 */
export const TimeoutError = createErrorClass(
  'TimeoutError',
  '@cancjs/promise:TimeoutError',
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
export const SupersededError = createErrorClass(
  'SupersededError',
  '@cancjs/toolbox:SupersededError',
  'call superseded',
);
/** Instance type of {@link SupersededError}. */
export type SupersededError = InstanceType<typeof SupersededError>;

/**
 * Thrown when a loop handle is used incorrectly: when a loop body skips `loop.next()` before the
 * next turn, or when `[Symbol.iterator]()` is called a second time on the same handle. Identified
 * across realms by its `Symbol.for('@cancjs/coroutine:IterationError')` prototype brand.
 */
export const IterationError = createErrorClass('IterationError', '@cancjs/coroutine:IterationError');
/** Instance type of {@link IterationError}. */
export type IterationError = InstanceType<typeof IterationError>;

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

// Brand first, name second: the platform builds three kinds itself, and those cannot be branded.
// Errors that only canc produces are matched by brand alone.

/**
 * Safely reads a property from an object, returning undefined if property access throws.
 */
export function readProp(obj: any, key: PropertyKey): unknown {
  if (obj == null) {
    return undefined;
  }
  try {
    return obj[key];
  } catch {
    return undefined;
  }
}

/**
 * Whether value is an AbortError. Matches the `Symbol.for('@cancjs/promise:AbortError')` prototype brand or the `name` property, never `instanceof`.
 */
export const isAbortError = (error: any): error is AbortError =>
  isObject(error) && (readProp(error, ABORT_ERROR_BRAND) === true || readProp(error, 'name') === 'AbortError');

/**
 * Whether value is a TimeoutError. Matches the `Symbol.for('@cancjs/promise:TimeoutError')` prototype brand or the `name` property, never `instanceof`.
 */
export const isTimeoutError = (error: any): error is TimeoutError =>
  isObject(error) && (readProp(error, TIMEOUT_ERROR_BRAND) === true || readProp(error, 'name') === 'TimeoutError');

/**
 * Whether value is a SupersededError. Matches the `Symbol.for('@cancjs/toolbox:SupersededError')` prototype brand alone, never the `name` property or `instanceof`.
 */
export const isSupersededError = (error: any): error is SupersededError =>
  isObject(error) && readProp(error, SUPERSEDED_ERROR_BRAND) === true;

/**
 * Whether value is an AggregateError. Matches the `Symbol.for('@cancjs/promise:AggregateError')` prototype brand or the `name` property, never `instanceof`.
 */
export const isAggregateError = (error: any): error is AggregateError =>
  isObject(error) && (readProp(error, AGGREGATE_ERROR_BRAND) === true || readProp(error, 'name') === 'AggregateError');

/**
 * Prototype brand for CancelError instances, registered under `Symbol.for('@cancjs/promise:CancelError')`.
 */
export const CANCEL_ERROR_BRAND = Symbol.for('@cancjs/promise:CancelError');

/**
 * Whether value is a CancelError. Matches the `Symbol.for('@cancjs/promise:CancelError')` prototype brand only, never name or `instanceof`.
 */
export const isCancelError = (error: any): boolean => isObject(error) && readProp(error, CANCEL_ERROR_BRAND) === true;

/**
 * Constructor producing a CancelError instance.
 */
export type TMakeCancelError<T = any> = new (message?: string, options?: { cause?: unknown }) => T;

export interface IToCancelErrorOptions<T = any> {
  CancelError: TMakeCancelError<T>;
}

/**
 * Normalizes an arbitrary rejection or abort reason into a CancelError,
 * reproducing core cancel(reason) semantics.
 *
 * A CancelError passes through unchanged. An object reason is wrapped in a fresh
 * CancelError as its cause. A primitive reason becomes the CancelError message
 * without a cause. Getters on CancelError govern timedOut and aborted.
 */
export function toCancelError<T extends object = Error>(reason: unknown, CancelError: TMakeCancelError<T>): T {
  if (isCancelError(reason)) {
    return reason as T;
  }

  if (isObject(reason)) {
    return new CancelError(undefined, { cause: reason });
  }

  return new CancelError(reason as any);
}

/**
 * Factory creating a toCancelError normalizer bound to a specific CancelError constructor.
 */
export function toCancelErrorFactory<T extends object = Error>(deps: IToCancelErrorOptions<T>): (reason: unknown) => T {
  const { CancelError } = deps;
  return (reason: unknown) => toCancelError(reason, CancelError);
}
