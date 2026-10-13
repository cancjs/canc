/**
 * Marks a failure set as open: the promise may also reject with reasons not listed.
 *
 * Add it next to the declared failures, as in `CancelablePromise<T, HttpError | Unlisted>`. A
 * rejection handler then receives `any`, the same as on a native promise, while the declared
 * members stay visible in the type. Type only, nothing exists at runtime.
 */
export interface Unlisted {
  readonly _cancUnlisted: true;
}

// a promise that never rejects stays closed instead of gaining the marker
export type TOrUnlisted<TFailure> = [TFailure] extends [never] ? never : TFailure | Unlisted;
