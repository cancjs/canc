/**
 * Coroutine failure-channel fixture for the TS matrix harness.
 *
 * Compiled in every lane, so it must stay inside the lowest TS version the matrix pins. Each row
 * pins the failure type a coroutine infers from the promises it awaits and the errors it throws,
 * next to the raw promise combinators that feed it. Expected values record the current behavior.
 */
import type { FailureOf, Unlisted } from '@cancjs/promise';
import CancelablePromise from '@cancjs/promise';
import { async as cancAsync, await as cancAwait, cancThrow } from '@cancjs/coroutine';

import type { Assert, Eq } from './assert-type';

class FooError extends Error {
  readonly foo = 1 as const;
}

class BarError extends Error {
  readonly bar = 1 as const;
}

type _distinctErrors = Assert<Eq<Eq<FooError, BarError>, false>>;

declare const nativeNumber: Promise<number>;
declare const nativeString: Promise<string>;
declare const undeclared: CancelablePromise<number>;
declare const declared: CancelablePromise<number, FooError>;

// raw promise combinators
const rejected = CancelablePromise.reject(new Error('x'));
const anyMix = CancelablePromise.any([undeclared, nativeNumber]);
const raceMix = CancelablePromise.race([declared, nativeNumber]);
type _rejected = Assert<Eq<FailureOf<typeof rejected>, never>>;
type _anyMixIsError = Assert<Eq<Exclude<FailureOf<typeof anyMix>, Unlisted> extends Error ? true : false, true>>;
type _anyMixIsOpen = Assert<Eq<Extract<FailureOf<typeof anyMix>, Unlisted>, Unlisted>>;
type _anyMixIsNotPlainError = Assert<Eq<Eq<FailureOf<typeof anyMix>, Error>, false>>;
type _raceMix = Assert<Eq<FailureOf<typeof raceMix>, FooError | Unlisted>>;

// coroutines
const coA = cancAsync(function* () {
  const n = yield* cancAwait(nativeNumber);
  return n;
});
const coB = cancAsync(function* () {
  const n = yield* cancAwait(declared);
  return n;
});
const coD = cancAsync(function* () {
  const n = yield* cancAwait(declared);
  const m = yield* cancAwait(nativeNumber);
  return n + m;
});
const coD3 = cancAsync(function* () {
  const n = yield* cancAwait(declared);
  const m = yield* cancAwait(nativeString);
  return n + m;
});
const coH = cancAsync(function* () {
  const n = yield* cancAwait(declared);
  if (n) yield* cancThrow(new BarError());
  return n;
});
const coH3 = cancAsync(function* () {
  const n = yield* cancAwait(nativeNumber);
  if (n) yield* cancThrow(new BarError());
  return n;
});
type _coA = Assert<Eq<FailureOf<ReturnType<typeof coA>>, never>>;
type _coB = Assert<Eq<FailureOf<ReturnType<typeof coB>>, FooError>>;
type _coD = Assert<Eq<FailureOf<ReturnType<typeof coD>>, FooError>>;
type _coD3 = Assert<Eq<FailureOf<ReturnType<typeof coD3>>, FooError>>;
type _coH = Assert<Eq<FailureOf<ReturnType<typeof coH>>, FooError | BarError>>;
type _coH3 = Assert<Eq<FailureOf<ReturnType<typeof coH3>>, BarError>>;

// a declared failure does not fit a slot declaring a different one
declare function takeNever(p: CancelablePromise<number, never>): void;
declare function takeFoo(p: CancelablePromise<number, FooError>): void;

// prettier-ignore
// @ts-expect-error declared failure into a declares-nothing slot
takeNever(coB());
// prettier-ignore
// @ts-expect-error thrown failure into a slot declaring another
takeFoo(coH3());
