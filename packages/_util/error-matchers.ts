import { ABORT_ERROR_BRAND, AGGREGATE_ERROR_BRAND, readProp, TIMEOUT_ERROR_BRAND } from './errors';
import { isFunction, isObject } from './guards';

/**
 * Predicate form of an error matcher: given a thrown value, decide whether it is the kind being
 * matched.
 */
export type TErrorPredicate = (error: any) => boolean;

/**
 * Constructor form of an error matcher.
 */
export type TErrorConstructor = new (...args: any[]) => any;

/**
 * What a matcher factory accepts. A string matches by error name, a constructor matches by
 * instance or brand (and by name too, unless the class is one only canc produces), and any other
 * function is used as a predicate.
 */
export type TErrorMatcher = string | TErrorPredicate | TErrorConstructor;

/**
 * Infers the error type matched by a single error matcher.
 */
export type MatchedError<M> =
  M extends TErrorConstructor ? InstanceType<M>
  : M extends (error: any) => error is infer G ? G
  : M extends string ? Error & { name: M }
  : Error;

/**
 * Infers the error type narrowed out by a single error matcher.
 */
export type SubtractedError<M> =
  M extends TErrorConstructor ? InstanceType<M>
  : M extends (error: any) => error is infer G ? G
  : M extends string ? Error & { name: M }
  : never;

/**
 * Union of error types matched by an array or tuple of error matchers.
 */
export type MatchedOf<M extends readonly TErrorMatcher[]> = MatchedError<M[number]>;

/**
 * Union of error types narrowed out by an array or tuple of error matchers.
 */
export type SubtractedOf<M extends readonly TErrorMatcher[]> = SubtractedError<M[number]>;

// Error classes carry their identity as a Symbol.for entry on the prototype, and Symbol.keyFor
// answers with a string only for registry symbols. Scanning for one is how a constructor is mapped
// to the brand its instances answer to, without the class having to declare anything.
function findRegistryBrand(prototype: object): symbol | undefined {
  if (
    typeof Symbol === 'undefined' ||
    typeof Symbol.keyFor !== 'function' ||
    typeof Object.getOwnPropertySymbols !== 'function'
  ) {
    return undefined;
  }

  let symbols: symbol[];
  try {
    symbols = Object.getOwnPropertySymbols(prototype);
  } catch {
    return undefined;
  }

  for (const symbol of symbols) {
    if (Symbol.keyFor(symbol) !== undefined) {
      return symbol;
    }
  }

  return undefined;
}

// kinds whose guards also accept a bare name, any other branded class matches by brand alone
const NAME_MATCHED_BRANDS: readonly symbol[] = [ABORT_ERROR_BRAND, TIMEOUT_ERROR_BRAND, AGGREGATE_ERROR_BRAND];

const MAX_PROTOTYPE_DEPTH = 64;

// Error.prototype of any realm: `instanceof Error` only sees this realm's, so a TypeError taken
// from a vm context or an iframe would otherwise fall through to the predicate branch
function isErrorRootPrototype(candidate: object): boolean {
  if (candidate === Error.prototype) {
    return true;
  }

  const constructor = readProp(candidate, 'constructor');

  return (
    typeof constructor === 'function' &&
    readProp(constructor, 'prototype') === candidate &&
    readProp(constructor, 'name') === 'Error'
  );
}

function hasErrorPrototype(prototype: object): boolean {
  let current: unknown = prototype;

  try {
    for (let depth = 0; depth < MAX_PROTOTYPE_DEPTH && isObject(current); depth++) {
      if (isErrorRootPrototype(current as object)) {
        return true;
      }
      current = Object.getPrototypeOf(current);
    }
  } catch {
    // hostile prototype
  }

  return false;
}

function compileMatcher(matcher: TErrorMatcher): TErrorPredicate {
  if (typeof matcher === 'string') {
    return (error: any) => isObject(error) && readProp(error, 'name') === matcher;
  }

  if (!isFunction(matcher)) {
    throw new TypeError('An error matcher must be a string, an error constructor or a predicate function');
  }

  // The isFunction guard above narrows to the call signature, which a construct-only type is not
  // assignable to, so the two shapes only meet through unknown.
  const candidate = matcher as unknown as TErrorConstructor;
  const prototype = readProp(candidate, 'prototype') as object | undefined;
  // Discovered once, here, so the returned closure never scans again.
  const brand = isObject(prototype) ? findRegistryBrand(prototype!) : undefined;
  // An arrow function has no prototype at all, so a predicate written as an arrow never reaches
  // this test. A `function foo(error) {}` predicate does have one, but it is neither Error-ish nor
  // branded, so it falls through to the predicate branch too. DOMException does not inherit from
  // Error on every supported engine, which is why the brand is part of the condition instead of
  // the Error.prototype walk carrying it alone.
  const isErrorClass = isObject(prototype) && (brand !== undefined || hasErrorPrototype(prototype!));

  if (!isErrorClass) {
    return matcher as TErrorPredicate;
  }

  const ErrorClass = candidate;
  const name = readProp(ErrorClass, 'name');
  const matchesByName =
    typeof name === 'string' && name.length > 0 && (brand === undefined || NAME_MATCHED_BRANDS.includes(brand));

  // Three ways to the same identity, weakest last: the class itself, the brand a second copy of
  // the class shares through the symbol registry, and the name a foreign error of the same kind
  // carries.
  return (error: any) => {
    let isInstance = false;
    try {
      isInstance = error instanceof ErrorClass;
    } catch {
      // hostile proxy or symbol
    }

    return (
      isInstance ||
      (brand !== undefined && isObject(error) && readProp(error, brand) === true) ||
      (matchesByName && isObject(error) && readProp(error, 'name') === name)
    );
  };
}

/**
 * Compile a matcher list into a single predicate that answers true when any matcher matches. The
 * work happens here, once, so the produced predicate only runs comparisons.
 *
 * @param matchers one or more names, error constructors or predicates
 * @param factoryName the calling factory, used in the empty-list error message
 */
export function compileErrorMatchers(matchers: TErrorMatcher[], factoryName: string): TErrorPredicate {
  if (matchers.length === 0) {
    throw new TypeError(`${factoryName} requires at least one error matcher`);
  }

  const predicates = matchers.map(compileMatcher);

  if (predicates.length === 1) {
    return predicates[0];
  }

  return (error: any) => {
    for (const predicate of predicates) {
      if (predicate(error)) {
        return true;
      }
    }

    return false;
  };
}
