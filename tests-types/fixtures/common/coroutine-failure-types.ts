/**
 * Coroutine failure-channel fixture for the TS matrix harness.
 *
 * Compiled in every lane, so it must stay inside the lowest TS version the matrix pins. Each row
 * pins the failure type a coroutine infers from the promises it awaits and the errors it throws,
 * next to the raw promise combinators that feed it. Expected values record the current behavior.
 */
import type { FailureOf, Unlisted } from '@cancjs/promise';
import CancelablePromise, { CancelError, createIsError, FAILURE, isTimeoutError, TimeoutError } from '@cancjs/promise';
import type { ICancAsyncGenerator } from '@cancjs/coroutine/gen';
import { async as cancAsync, await as cancAwait, cancThrow } from '@cancjs/coroutine';
import { async as cancGenAsync, await as cancGenAwait, throw as cancGenThrow } from '@cancjs/coroutine/gen';
import cancelableFetch from '@cancjs/fetch';
import { timeout } from '@cancjs/toolbox';

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

// throwing or awaiting a cancellation adds nothing to the declared set
declare const declaredWithCancel: CancelablePromise<number, FooError | CancelError>;
const coCancelThrow = cancAsync(function* () {
  const n = yield* cancAwait(nativeNumber);
  if (n) yield* cancThrow(new CancelError());
  return n;
});
const coCancelThrowFoo = cancAsync(function* () {
  const n = yield* cancAwait(declared);
  if (n) yield* cancThrow(new CancelError());
  return n;
});
const coCancelAwait = cancAsync(function* () {
  return yield* cancAwait(declaredWithCancel);
});
const genCancelThrow = cancGenAsync(function* () {
  const n = yield* cancGenAwait(nativeNumber);
  if (n) yield* cancGenThrow(new CancelError());
  yield n;
});
type _coCancelThrow = Assert<Eq<FailureOf<ReturnType<typeof coCancelThrow>>, never>>;
type _coCancelThrowFoo = Assert<Eq<FailureOf<ReturnType<typeof coCancelThrowFoo>>, FooError>>;
type _coCancelAwait = Assert<Eq<FailureOf<ReturnType<typeof coCancelAwait>>, FooError>>;
type _genCancelThrow = Assert<Eq<FailureOf<ReturnType<typeof genCancelThrow>>, never>>;

// the generator carrier and a bare branded step strip it on their own
declare const genWithCancel: ICancAsyncGenerator<number, void, any, FooError | CancelError>;
type _genCarrierStripsCancel = Assert<Eq<FailureOf<typeof genWithCancel>, FooError>>;

declare const brandedCancelStep: PromiseLike<number> & { readonly [FAILURE]?: BarError | CancelError };
const coBrandedCancel = cancAsync(function* () {
  return yield* cancAwait(brandedCancelStep);
});
type _coBrandedCancel = Assert<Eq<FailureOf<ReturnType<typeof coBrandedCancel>>, BarError>>;

// a declared failure does not fit a slot declaring a different one
declare function takeNever(p: CancelablePromise<number, never>): void;
declare function takeFoo(p: CancelablePromise<number, FooError>): void;

// prettier-ignore
// @ts-expect-error declared failure into a declares-nothing slot
takeNever(coB());
// prettier-ignore
// @ts-expect-error thrown failure into a slot declaring another
takeFoo(coH3());

// coroutine README examples: awaiting open-set library calls
class NotFoundError extends Error {
  readonly notFound = 1 as const;
}

declare const dbQuery: (id: string) => Promise<{ name: string } | null>;

const loadUser = cancAsync(function* (id: string) {
  const res = yield* cancAwait(cancelableFetch(`/users/${id}`));
  const body = yield* cancAwait(res.json() as Promise<{ id: string }>);
  const row = yield* cancAwait(timeout(dbQuery(body.id), 500));
  if (!row) {
    return yield* cancThrow(new NotFoundError());
  }
  return row.name;
});
type _loadUser = Assert<
  Eq<
    ReturnType<typeof loadUser>,
    CancelablePromise<string, TimeoutError | NotFoundError | (TypeError & { readonly name: 'TypeError' })>
  >
>;

// closed result set: guards exhaust it and the last branch reads never
const isNotFound = createIsError(NotFoundError);
export const loadUserReason = loadUser('1').catch((e) => {
  if (isTimeoutError(e)) return 'slow';
  if (isNotFound(e)) return 'missing';
  if (e instanceof TypeError) {
    // the fetch member keeps its literal name, so the branch is that member alone
    const network: Eq<typeof e, TypeError & { readonly name: 'TypeError' }> = true;
    void network;
    return 'offline';
  }
  const last: Eq<typeof e, never> = true;
  void last;
  throw e;
});

// a one-argument outer annotation keeps the 1.0 reason
const loadAny: () => CancelablePromise<number> = cancAsync(function* () {
  return yield* cancAwait(timeout(nativeNumber, 10));
});
export const loadAnyReason = loadAny().catch((e) => e.response);
loadAny().catch((e) => {
  const c: Eq<typeof e, any> = true;
  return c;
});
