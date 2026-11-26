import { cancAsync, cancAwait } from '@cancjs/coroutine';
import { cancGenAsync, cancGenAwait } from '@cancjs/coroutine/gen';
import type { CancelablePromise, FailureOf } from '@cancjs/promise';

import type { Assert, Eq } from './assert-type';

class StepError extends Error {
  readonly step = true;
}

declare const typed: CancelablePromise<number, StepError>;
declare const native: PromiseLike<number>;

const co = cancAsync(function* () {
  return yield* cancAwait<number>(native);
});
type _co = Assert<Eq<ReturnType<typeof co>, CancelablePromise<number, never>>>;
const coRaw = cancAsync(function* () {
  yield* cancAwait(native);
  return yield* cancAwait(typed);
});
type _coRaw = Assert<Eq<ReturnType<typeof coRaw>, CancelablePromise<number, StepError>>>;
const coErased = cancAsync(function* () {
  return yield* cancAwait<number>(typed);
});
type _coErased = Assert<Eq<FailureOf<ReturnType<typeof coErased>>, never>>;
function generic<T>(input: T | PromiseLike<T>) {
  return cancAwait<T>(input);
}
const coGeneric = cancAsync(function* () {
  return yield* generic<number>(native);
});
type _coGeneric = Assert<Eq<ReturnType<typeof coGeneric>, CancelablePromise<number, never>>>;

const gen = cancGenAsync(function* () {
  const value = yield* cancGenAwait<number>(native);
  const checked: number = value;
  yield checked;
});
type _gen = Assert<Eq<FailureOf<ReturnType<typeof gen>>, never>>;
const genRaw = cancGenAsync(function* () {
  yield yield* cancGenAwait(typed);
});
type _genRaw = Assert<Eq<FailureOf<ReturnType<typeof genRaw>>, StepError>>;
const genErased = cancGenAsync(function* () {
  yield yield* cancGenAwait<number>(typed);
});
type _genErased = Assert<Eq<FailureOf<ReturnType<typeof genErased>>, never>>;
function genGeneric<T>(input: T | PromiseLike<T>) {
  return cancGenAwait<T>(input);
}
const genGenericFlow = cancGenAsync(function* () {
  const value = yield* genGeneric<number>(native);
  const checked: number = value;
  yield checked;
});
type _genGenericFlow = Assert<Eq<FailureOf<ReturnType<typeof genGenericFlow>>, never>>;

// @ts-expect-error explicit awaited value remains constrained
cancAwait<number>(Promise.resolve('wrong'));
// @ts-expect-error explicit awaited value remains constrained
cancGenAwait<number>(Promise.resolve('wrong'));
