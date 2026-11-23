import type { FailureOf, Unlisted } from '@cancjs/promise';
import CancelablePromise from '@cancjs/promise';

import { async as cancAsync, await as cancAwait } from '@cancjs/coroutine';

import type { Assert, Eq } from './assert-type';

class IterableError extends Error {
  readonly kind = 'iterable';
}

declare const owned: CancelablePromise<number, IterableError>;
declare const native: Promise<number>;

const fromSet = CancelablePromise.all(new Set([owned]));
type _setFailure = Assert<Eq<FailureOf<typeof fromSet>, IterableError>>;

function* generateOwned(): Generator<CancelablePromise<number, IterableError>, void, unknown> {
  yield owned;
}

const fromGenerator = CancelablePromise.all(generateOwned());
type _generatorFailure = Assert<Eq<FailureOf<typeof fromGenerator>, IterableError>>;

const nativeSet = CancelablePromise.all(new Set([native]));
type _nativeFailure = Assert<Eq<FailureOf<typeof nativeSet>, Unlisted>>;

const plainSet = CancelablePromise.all(new Set([1, 2]));
type _plainFailure = Assert<Eq<FailureOf<typeof plainSet>, never>>;

const mixedSet = new Set<CancelablePromise<number, IterableError> | Promise<number>>([owned, native]);
const mixed = CancelablePromise.all(mixedSet);
type _mixedFailure = Assert<Eq<FailureOf<typeof mixed>, IterableError | Unlisted>>;

const tuple = CancelablePromise.all([owned, native] as const);
type _tupleFailure = Assert<Eq<FailureOf<typeof tuple>, IterableError | Unlisted>>;

const readonlyArray: ReadonlyArray<CancelablePromise<number, IterableError>> = [owned];
const array = CancelablePromise.all(readonlyArray);
type _arrayFailure = Assert<Eq<FailureOf<typeof array>, IterableError>>;

const explicit = CancelablePromise.all<number>(new Set([Promise.resolve(7)]));
type _explicitResult = Assert<Eq<typeof explicit, CancelablePromise<number[], never>>>;

function collect<T>(values: Iterable<T | PromiseLike<T>>) {
  return CancelablePromise.all<T>(values);
}
const collected = collect<number>(new Set([native]));
type _collectedResult = Assert<Eq<typeof collected, CancelablePromise<number[], never>>>;

const coroutine = cancAsync(function* () {
  return yield* cancAwait(CancelablePromise.all(new Set([owned])));
});
type _coroutineFailure = Assert<Eq<FailureOf<ReturnType<typeof coroutine>>, IterableError>>;

export {};
