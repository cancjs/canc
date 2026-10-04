/**
 * Overload-selection fixture for the TS matrix harness.
 *
 * `then`, `catch` and `race` each ship several signatures, and most call shapes land on the last
 * one. The narrow signatures earlier in each list only change the result for a few shapes, and those
 * shapes are what this file pins. Every check here is an identity assertion: an annotated assignment
 * would still pass if the call fell through to a wider signature, because the wider result stays
 * assignable.
 *
 * Each block names the shape that reaches the signature and the result the next signature down
 * would produce instead, so a regression report says which signature stopped being selected.
 */
import CancelablePromise from '@cancjs/promise';
import type { Assert, Eq, Not } from './assert-type';

class OverloadError extends Error {
  readonly tag = 'overload';
}

class ChainedError extends Error {
  readonly tag = 'chained';
}

// The classes must not collapse into one type. If they did, a result that still carried the source
// failure would read as the chained one and the first check below could never go red.
type _distinctErrors = Assert<Not<Eq<OverloadError, ChainedError>>>;

declare const declared: CancelablePromise<string, OverloadError>;
declare const chainedSource: CancelablePromise<number, ChainedError>;

// Both callbacks present and both return positions thenable. The rejection callback throws, so its
// result type is `never`, and only this signature drops the declared failure for that shape: the
// next one down keeps the source channel whenever the rejection result is `never`, which would make
// this `ChainedError | OverloadError`.
const bothHandlers = declared.then(
  () => chainedSource,
  (reason) => {
    throw reason;
  },
);
type _bothHandlers = Assert<Eq<typeof bothHandlers, CancelablePromise<number, ChainedError>>>;

// No fulfillment callback and a throwing rejection callback. Same `never` rejection result, and
// again only this signature clears the channel; the next one down would report `OverloadError`
// even though the rejection was handled.
const rejectionOnly = declared.then(null, (reason) => {
  throw reason;
});
type _rejectionOnly = Assert<Eq<typeof rejectionOnly, CancelablePromise<string, never>>>;

// An explicit type argument naming the resolved value, over an iterable mixing that value with a
// promise of it. The array-only and plain-iterable signatures both reject this argument once `T` is
// pinned to `number`, so the mixed-element signature is the only one that accepts the call at all.
const mixedRace = CancelablePromise.race<number>([chainedSource, 3]);
type _mixedRace = Assert<Eq<typeof mixedRace, CancelablePromise<number, never>>>;

export {};
