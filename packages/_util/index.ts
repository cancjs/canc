import { readProp } from './errors';
import { isFunction, isObject, TAnyFn } from './guards';

/**
 * Structural cancelable promise shape: thenable exposing a `cancel` method.
 */
export interface ICancelable<T = any> extends PromiseLike<T> {
  cancel: (reason?: any) => void;
}

export * from './guards';

// Shape of the subset of the reflect-metadata polyfill's API this module feature-detects and calls.
interface IReflectMetadataApi {
  getOwnMetadataKeys: (target: object) => PropertyKey[];
  getOwnMetadata: (metadataKey: PropertyKey, target: object) => unknown;
  defineMetadata: (metadataKey: PropertyKey, metadataValue: unknown, target: object) => void;
}

/**
 * Whether value is an object or a function exposing a callable `then` method.
 */
export const isThenable = (obj: any): obj is PromiseLike<any> =>
  (isObject(obj) || isFunction(obj)) && isFunction((obj as Record<PropertyKey, unknown>).then);

/**
 * Whether value conforms to the Generator interface.
 */
export const isGenerator = (value: any): value is Generator => {
  const candidate = value as Record<PropertyKey, unknown>;
  return isObject(value) && isFunction(candidate.next) && isFunction(candidate[Symbol.iterator]);
};

function describeNonGenerator(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'function') {
    return 'a function';
  }
  if (typeof value !== 'object') {
    return typeof value;
  }
  if (isThenable(value)) {
    return 'a promise';
  }
  return 'a non-generator object';
}

/**
 * Asserts that a value returned by a function expected to produce a generator conforms to the
 * synchronous generator protocol.
 *
 * Throws a TypeError if the value is an async generator, is not generator-shaped, or lacks a
 * callable return or throw method.
 */
export function assertGeneratorResult(
  value: unknown,
  context: string,
): asserts value is Generator<unknown, any, unknown> {
  if (!isObject(value)) {
    throw new TypeError(`${context}: expected a generator, received ${describeNonGenerator(value)}`);
  }

  if (
    typeof Symbol !== 'undefined' &&
    typeof Symbol.asyncIterator === 'symbol' &&
    readProp(value, Symbol.asyncIterator) !== undefined
  ) {
    throw new TypeError(`${context}: expected a synchronous generator, received an async generator`);
  }

  const candidate = value as Record<PropertyKey, unknown>;
  if (!isFunction(candidate.next)) {
    throw new TypeError(`${context}: expected a generator, received ${describeNonGenerator(value)}`);
  }

  if (!isFunction(candidate.return)) {
    throw new TypeError(
      `${context}: expected a generator with a callable return method, received a generator-like without return`,
    );
  }

  if (!isFunction(candidate.throw)) {
    throw new TypeError(
      `${context}: expected a generator with a callable throw method, received a generator-like without throw`,
    );
  }
}

/**
 * Asserts that an iterator step value is a valid step result object and not a thenable.
 *
 * Throws a TypeError if the value is not an object or is thenable.
 */
export function assertStepResult(step: unknown, context: string): asserts step is IteratorResult<unknown, unknown> {
  if (!isObject(step) || isThenable(step)) {
    throw new TypeError(
      isThenable(step) ?
        `${context}: expected an iterator step result object, received a promise`
      : `${context}: expected an iterator step result object, received a non-object`,
    );
  }
}

/**
 * Whether value is thenable and exposes a callable `cancel` method.
 */
export const isCancelable = (obj: any): obj is ICancelable =>
  isThenable(obj) && isFunction((obj as Partial<ICancelable>).cancel);

/**
 * A method decorator that replaces the method with a wrapper (coroutine or bound fn) hands back a
 * brand-new function object. Metadata and properties another decorator attached to the original
 * function are keyed on that function's identity and would be lost on the wrapper. Copy them over
 * so decorators applied earlier in the stack (e.g. reflect-metadata's own-function metadata set by
 * SetMetadata-style helpers) keep working. Metadata keyed on the class prototype and property key
 * is untouched by wrapping and needs no copying.
 */
export function copyFunctionMetadata(source: TAnyFn, target: TAnyFn): TAnyFn {
  if (source === target) {
    return target;
  }

  // reflect-metadata own-function metadata (feature-detected; absent without reflect-metadata).
  const reflect = (typeof Reflect !== 'undefined' ? Reflect : undefined) as IReflectMetadataApi | undefined;
  if (
    reflect &&
    isFunction(reflect.getOwnMetadataKeys) &&
    isFunction(reflect.getOwnMetadata) &&
    isFunction(reflect.defineMetadata)
  ) {
    const keys = reflect.getOwnMetadataKeys(source);
    for (const key of keys) {
      reflect.defineMetadata(key, reflect.getOwnMetadata(key, source), target);
    }
  }

  // Own enumerable properties another decorator may have tacked onto the function.
  const propNames = Object.keys(source);
  for (const propName of propNames) {
    const descriptor = Object.getOwnPropertyDescriptor(source, propName);
    if (descriptor) {
      Object.defineProperty(target, propName, descriptor);
    }
  }

  // Preserve identity-adjacent metadata so stack traces and arity checks still read the original.
  copyOwnProperty(source, target, 'name');
  copyOwnProperty(source, target, 'length');

  return target;
}

function copyOwnProperty(source: TAnyFn, target: TAnyFn, key: 'name' | 'length'): void {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (descriptor) {
    try {
      Object.defineProperty(target, key, descriptor);
    } catch {
      // Non-configurable target slot (rare); leave the wrapper's own value in place.
    }
  }
}

/**
 * Stage-3 decorators pass `(value, context)` where context is an object carrying `kind`; legacy
 * (TypeScript `experimentalDecorators` and babel legacy) decorators pass `(target, propertyKey,
 * descriptor?)` where the second argument is the property key itself (string or symbol). The two
 * call shapes are distinguishable on the second argument alone, which lets each decorator flavor
 * detect being invoked with the wrong transform's output and fail with a message pointing at the
 * right import instead of a confusing shape-mismatch crash deeper in the implementation.
 */
export const isLegacyShapedSecondArg = (value: any): value is string | symbol =>
  typeof value === 'string' || typeof value === 'symbol';

/**
 * Whether value is a stage-3 decorator context object carrying a string `kind` property.
 */
export const isStage3Context = (value: any): value is { kind: string } =>
  isObject(value) && typeof (value as Record<PropertyKey, unknown>).kind === 'string';

/**
 * Babel-legacy descriptors always carry an `initializer` key for fields (a function, or explicitly
 * null when uninitialized) and a real descriptor object for methods/getters/setters. TS-legacy never
 * passes a descriptor for fields at all (2-arg call) and never sets `initializer`. Presence of the
 * `initializer` key (own or inherited via the object literal babel emits) is therefore a reliable
 * tell that a babel-legacy-shaped descriptor was handed to a TS-legacy decorator.
 */
export const isBabelLegacyDescriptor = (descriptor: any): boolean =>
  isObject(descriptor) && 'initializer' in descriptor;

export * from './error-matchers';
export * from './errors';
export * from './fn-meta';
export type { TOrUnlisted, Unlisted } from './unlisted';
