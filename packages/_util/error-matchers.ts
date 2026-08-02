import { isFunction, isObject } from './index';

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
 * instance, brand or name, and any other function is used as a predicate.
 */
export type TErrorMatcher = string | TErrorPredicate | TErrorConstructor;

// Our error classes carry their identity as a Symbol.for entry on the prototype, and Symbol.keyFor
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

  const symbols = Object.getOwnPropertySymbols(prototype);

  for (const symbol of symbols) {
    if (Symbol.keyFor(symbol) !== undefined) {
      return symbol;
    }
  }

  return undefined;
}

function compileMatcher(matcher: TErrorMatcher): TErrorPredicate {
  if (typeof matcher === 'string') {
    return (error: any) => isObject(error) && error.name === matcher;
  }

  if (!isFunction(matcher)) {
    throw new TypeError('An error matcher must be a string, an error constructor or a predicate function');
  }

  // The isFunction guard above narrows to the call signature, which a construct-only type is not
  // assignable to, so the two shapes only meet through unknown.
  const candidate = matcher as unknown as TErrorConstructor;
  const prototype = candidate.prototype;
  // Discovered once, here, so the returned closure never scans again.
  const brand = isObject(prototype) ? findRegistryBrand(prototype) : undefined;
  // An arrow function has no prototype at all, so a predicate written as an arrow never reaches
  // this test. A `function foo(error) {}` predicate does have one, but it is neither Error-ish nor
  // branded, so it falls through to the predicate branch too. DOMException does not inherit from
  // Error on every supported engine, which is why the brand is part of the condition instead of
  // `prototype instanceof Error` carrying it alone.
  const isErrorClass =
    isObject(prototype) && (prototype instanceof Error || prototype === Error.prototype || brand !== undefined);

  if (!isErrorClass) {
    return matcher as TErrorPredicate;
  }

  const ErrorClass = candidate;
  const name = (ErrorClass as unknown as { name?: unknown }).name;

  // Three ways to the same identity, weakest last: the class itself, the brand a second copy of
  // the class shares through the symbol registry, and the name a foreign error of the same kind
  // carries.
  return (error: any) =>
    error instanceof ErrorClass ||
    (brand !== undefined && isObject(error) && error[brand] === true) ||
    (isObject(error) && error.name === name);
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
