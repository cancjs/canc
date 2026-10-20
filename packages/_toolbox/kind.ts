import type { Unlisted } from '../_util';

/**
 * A promise flavor, described at the type level. `value` is the slot a helper fills with the type
 * it resolves to and `promise` reads that slot to build the promise type; `options` is the options
 * bag the implementation's constructor accepts.
 *
 * TypeScript cannot take `CancelablePromise` as a type argument and apply it to a value type
 * later, so this pair of slots stands in for that. It is what lets one shared algorithm return a
 * `CancelablePromise<T>` in one package and a `Promise<T>` in another from the same source, with no
 * cast at either call site. Read a flavor through `TPromiseOf`, never by indexing `promise`
 * directly.
 */
export interface IPromiseKind {
  value: unknown;
  failure: unknown;
  promise: unknown;
  options: object;
}

/** The default flavor: the minimal thenable every implementation satisfies. */
export interface IPromiseLikeKind extends IPromiseKind {
  promise: PromiseLike<this['value']>;
}

/** Apply a flavor to a value type and a failure set. */
export type TPromiseOf<K extends IPromiseKind, T, F = never> = (K & { value: T; failure: F })['promise'];

/**
 * The failure set a flavor reads off one of its promises. A flavor opts in with an `input` slot
 * and a `failureOf` slot computed from it; the shared code cannot name the promise type itself.
 * A flavor without the slots reads every input as open.
 */
export type TFailureOf<K extends IPromiseKind, P> =
  K extends { failureOf: unknown } ? (K & { input: P })['failureOf'] : Unlisted;

/** The value a promise-like input settles with. */
export type TValueOf<P> = P extends PromiseLike<infer T> ? T : never;
