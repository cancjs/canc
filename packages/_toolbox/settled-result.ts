/** Outcome of a fulfilled input in `allSettled`. Same shape as the ES2020 lib type of the same role. */
export interface ISettledFulfilled<T> {
  status: 'fulfilled';
  value: T;
}

/** Outcome of a rejected input in `allSettled`. Same shape as the ES2020 lib type of the same role. */
export interface ISettledRejected {
  status: 'rejected';
  reason: any;
}

/**
 * Outcome of one input in `allSettled`.
 *
 * Declared here so the emitted types do not depend on the ES2020 lib, which a consumer targeting
 * an older `lib` does not have. It has the same shape as the lib type of the same role.
 */
export type ISettledResult<T> = ISettledFulfilled<T> | ISettledRejected;
