// Duck-type checks shared by the toolbox algorithms.
//
// These deliberately do not come from the _util module: _util type-imports the cancelable promise
// package, and the native toolbox twin is built to have no dependency on it at all. The shapes
// below are structural, so nothing here needs to know which promise implementation is in play.

/** A thenable exposing a `cancel` method, the minimal shape needed to stop it. */
export interface ICancelableLike {
  then: PromiseLike<any>['then'];
  cancel: (reason?: any) => void;
}

export function isObjectLike(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isFunction(value: unknown): value is (...args: any[]) => any {
  return typeof value === 'function';
}

export function isThenableLike<T>(value: unknown): value is PromiseLike<T> {
  return isObjectLike(value) && typeof value.then === 'function';
}

export function isCancelableLike(value: unknown): value is ICancelableLike {
  return isObjectLike(value) && typeof value.cancel === 'function';
}

/**
 * Well-known registry brand for `@cancjs/promise`'s CancelError (`cancel-error.ts`). Checked here
 * by the raw `Symbol.for` key rather than imported, so this module (and the native toolbox twin
 * built from it) carries no runtime dependency on `@cancjs/promise`. The same rationale as every
 * other guard in this file: cross-realm/cross-copy safe by construction, since the symbol resolves
 * to the same value from any package copy.
 */
export const CANCEL_ERROR_BRAND = Symbol.for('@cancjs/promise:CancelError');

/** Structural match for a CancelError-shaped rejection: carries the CancelError registry brand. */
export function isCancelErrorLike(value: unknown): boolean {
  return isObjectLike(value) && value[CANCEL_ERROR_BRAND] === true;
}

/**
 * Whether a time helper's input is a thunk. Any function counts: the helpers treat a function as
 * work that produces the value, never as the value itself, which is what makes `delay(() => job(),
 * 50)` and `timeout(fetchAll, 50)` read the same way.
 */
export function isThunk<T>(value: unknown): value is () => T | PromiseLike<T> {
  return isFunction(value);
}
