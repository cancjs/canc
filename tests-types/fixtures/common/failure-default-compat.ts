/**
 * One-argument annotation fixture: a `CancelablePromise<T>` written without a failure type is
 * undeclared (`unknown`), not "declares nothing" (`never`).
 *
 * The first block is code that compiled against `@cancjs/promise@1.0.0` and must keep compiling.
 * The rest pins how an undeclared promise mixes with declared ones: any mix holding an undeclared
 * member reads `unknown`, declared-only mixes keep their union, and an undeclared promise does not
 * fit a declared slot.
 */
import type { FailureOf, Unlisted } from '@cancjs/promise';
import type { AxiosError } from 'axios';
import CancelablePromise, { AbortError, catchCancel, catchErrors, TimeoutError } from '@cancjs/promise';
import { async as cancAsync, await as cancAwait } from '@cancjs/coroutine';
import canc from '@cancjs/axios';
import cancelableFetch from '@cancjs/fetch';
import { debounce, delay, limit, map, minDelay, timeout, waitFor } from '@cancjs/toolbox';

import type { Assert, Eq } from './assert-type';

class FooError extends Error {
  readonly name = 'FooError' as const;
}

class BarError extends Error {
  readonly name = 'BarError' as const;
}

type _distinctErrors = Assert<Eq<Eq<FooError, BarError>, false>>;

// one-argument annotations that compiled on 1.0
export function annotatedReject(): CancelablePromise<number> {
  return CancelablePromise.reject(new Error('x'));
}

export const branchReject: CancelablePromise<number> = CancelablePromise.resolve(1).then((n) =>
  n ? CancelablePromise.reject(new TypeError('t')) : n,
);

export const allTupleCast: CancelablePromise<[number, number]> = CancelablePromise.all([
  CancelablePromise.reject(new Error('e')),
  2,
] as const) as CancelablePromise<[number, number]>;

export const allAnnotated: CancelablePromise<number[]> = CancelablePromise.all([
  CancelablePromise.reject(new Error('e')),
  2,
]);

// an untyped reason declares nothing, and the reason param stays usable
export const rejectResultArg = CancelablePromise.reject<number>(new Error('x'));
type _rejectResultArg = Assert<Eq<typeof rejectResultArg, CancelablePromise<number, never>>>;

// a rejection reason is not read as a declared failure, naming one is explicit
export const rejectReason = CancelablePromise.reject(new Error('x')).catch((e) => e.code);
const rejectError = CancelablePromise.reject(new Error('x'));
const rejectNamed = CancelablePromise.reject<never, FooError>(new FooError());
export const rejectContextual: CancelablePromise<number, FooError> = CancelablePromise.reject(new FooError());
type _rejectError = Assert<Eq<FailureOf<typeof rejectError>, never>>;
type _rejectNamed = Assert<Eq<FailureOf<typeof rejectNamed>, FooError>>;

// a named failure checks the reason
// @ts-expect-error reason outside the named failure
export const rejectNamedOther = CancelablePromise.reject<never, FooError>(new BarError());
// @ts-expect-error reason outside the contextual failure
export const rejectContextualOther: CancelablePromise<number, FooError> = CancelablePromise.reject(new BarError());

const coRejectError = cancAsync(function* () {
  yield CancelablePromise.reject(new Error('x'));
  return 1;
});
export const coRejectReason = coRejectError().catch((e) => e.code);
type _coRejectError = Assert<Eq<FailureOf<ReturnType<typeof coRejectError>>, never>>;

export const coroutineReject: () => CancelablePromise<number> = cancAsync(function* () {
  const v: number = yield CancelablePromise.reject(new TypeError('x'));
  return v;
});

function takeOneArg(p: CancelablePromise<number>): void {
  void p;
}
takeOneArg(CancelablePromise.reject(new RangeError('r')));

declare const annotated: CancelablePromise<number>;

// the reason is `any` when nothing is declared, as on 1.0 and on a native promise
export const reasonOfAnnotated = annotated.catch((e) => String(e.message));
export const reasonOfDerived = CancelablePromise.resolve(1).catch((e) => String(e.message));
export const reasonOfChain = annotated.then((n) => n + 1).catch((e) => String(e.message));
type _reasonOfAnnotated = Assert<Eq<typeof reasonOfAnnotated, CancelablePromise<string | number, never>>>;
type _reasonOfDerived = Assert<Eq<typeof reasonOfDerived, CancelablePromise<string | number, never>>>;
type _reasonOfChain = Assert<Eq<typeof reasonOfChain, CancelablePromise<string | number, never>>>;

export const branchRejectString: CancelablePromise<string> = annotated.then((n) =>
  n ? CancelablePromise.reject(new Error('e')) : 's',
);

export const executorReject = new CancelablePromise<number>((_res, rej) => rej(new Error('x')));
type _executorReject = Assert<Eq<FailureOf<typeof executorReject>, unknown>>;

// mixes
declare const u: CancelablePromise<number>;
declare const f: CancelablePromise<number, FooError>;
declare const g: CancelablePromise<number, BarError>;
declare const n: CancelablePromise<number, never>;

// an undeclared member makes the whole mix undeclared
const raceUF = CancelablePromise.race([u, f]);
const raceFU = CancelablePromise.race([f, u]);
const allUF = CancelablePromise.all([u, f]);
const allArrUF = CancelablePromise.all([u, f] as CancelablePromise<number, unknown>[]);
const coUF = cancAsync(function* () {
  const a: number = yield u;
  const b: number = yield f;
  return a + b;
});
const coAwaitUF = cancAsync(function* () {
  const a = yield* cancAwait(u);
  const b = yield* cancAwait(f);
  return a + b;
});
const thenUF = u.then(() => f);
const thenFU = f.then(() => u);
const resolveU = CancelablePromise.resolve(u);
const finallyU = u.finally(() => {});
type _raceUF = Assert<Eq<FailureOf<typeof raceUF>, unknown>>;
type _raceFU = Assert<Eq<FailureOf<typeof raceFU>, unknown>>;
type _allUF = Assert<Eq<FailureOf<typeof allUF>, unknown>>;
type _allArrUF = Assert<Eq<FailureOf<typeof allArrUF>, unknown>>;
type _coUF = Assert<Eq<FailureOf<ReturnType<typeof coUF>>, unknown>>;
type _coAwaitUF = Assert<Eq<FailureOf<ReturnType<typeof coAwaitUF>>, unknown>>;
type _thenUF = Assert<Eq<FailureOf<typeof thenUF>, unknown>>;
type _thenFU = Assert<Eq<FailureOf<typeof thenFU>, unknown>>;
type _resolveU = Assert<Eq<FailureOf<typeof resolveU>, unknown>>;
type _finallyU = Assert<Eq<FailureOf<typeof finallyU>, unknown>>;

// declared-only mixes keep their union
const raceFG = CancelablePromise.race([f, g]);
const allFG = CancelablePromise.all([f, g]);
const coFG = cancAsync(function* () {
  const a: number = yield f;
  const b: number = yield g;
  return a + b;
});
const thenFG = f.then(() => g);
const raceFN = CancelablePromise.race([f, n, CancelablePromise.resolve(2)]);
type _raceFG = Assert<Eq<FailureOf<typeof raceFG>, FooError | BarError>>;
type _allFG = Assert<Eq<FailureOf<typeof allFG>, FooError | BarError>>;
type _coFG = Assert<Eq<FailureOf<ReturnType<typeof coFG>>, FooError | BarError>>;
type _thenFG = Assert<Eq<FailureOf<typeof thenFG>, FooError | BarError>>;
type _raceFN = Assert<Eq<FailureOf<typeof raceFN>, FooError>>;

// a native promise member does not absorb the canc members
const raceFP = CancelablePromise.race([f, Promise.resolve(3)]);
const raceUP = CancelablePromise.race([u, Promise.resolve(3)]);
const raceFV = CancelablePromise.race([f, 'v']);
declare const fooList: CancelablePromise<number, FooError>[];
const raceArrF = CancelablePromise.race(fooList);
type _raceFP = Assert<Eq<typeof raceFP, CancelablePromise<number, FooError | Unlisted>>>;
type _raceUP = Assert<Eq<typeof raceUP, CancelablePromise<number, unknown>>>;
type _raceFV = Assert<Eq<typeof raceFV, CancelablePromise<number | string, FooError>>>;
type _raceArrF = Assert<Eq<typeof raceArrF, CancelablePromise<number, FooError>>>;

// subtracting from an undeclared failure leaves it undeclared
const catchErrorsU = catchErrors(u, FooError);
const catchErrorsF = catchErrors(f, FooError);
const catchCancelU = catchCancel(u);
type _catchErrorsU = Assert<Eq<FailureOf<typeof catchErrorsU>, unknown>>;
type _catchErrorsF = Assert<Eq<FailureOf<typeof catchErrorsF>, never>>;
type _catchCancelU = Assert<Eq<FailureOf<typeof catchCancelU>, unknown>>;

// a handled rejection declares nothing
const caughtU = u.catch(() => 0);
const handledU = u.then(
  (x) => x,
  () => 0,
);
type _caughtU = Assert<Eq<FailureOf<typeof caughtU>, never>>;
type _handledU = Assert<Eq<FailureOf<typeof handledU>, never>>;

// reason types
u.catch((e) => {
  const c: Eq<typeof e, any> = true;
  return c;
});
n.catch((e) => {
  const c: Eq<typeof e, any> = true;
  return c;
});
f.catch((e) => {
  const c: Eq<typeof e, FooError> = true;
  return c;
});
u.then(undefined, (e) => {
  const c: Eq<typeof e, any> = true;
  return c;
});

// the any combinator rejects with a lib error inside an open set, so the reason stays untyped
interface AggregateErrorShape extends Error {
  errors: any[];
}
declare const nativeNumber: Promise<number>;
export const anyReason = CancelablePromise.any([u, nativeNumber]).catch((e) => e.code);
const anyFF = CancelablePromise.any([f, f]);
const coAnyFN = cancAsync(function* () {
  const x = yield* cancAwait.any([f, nativeNumber]);
  return x;
});
type _anyFF = Assert<Eq<FailureOf<typeof anyFF>, AggregateErrorShape | Unlisted>>;
type _coAnyFN = Assert<Eq<FailureOf<ReturnType<typeof coAnyFN>>, AggregateErrorShape>>;

// timers and fetch reject with a library error inside an open set, so 1.0 reason bodies compile
export const timeoutReason = timeout(u, 10).catch((e) => e.response);
export const timeoutNativeReason = timeout(nativeNumber, 10).catch((e) => e.response);
export const bareTimeoutReason = timeout(10).catch((e) => e.code);
export const waitForReason = waitFor(() => true).catch((e) => e.code);
export const fetchReason = cancelableFetch('x').catch((e) => e.code);
const timeoutN = timeout(nativeNumber, 10);
const waitForN = waitFor(() => true);
const fetchN = cancelableFetch('x');
const timeoutCaught = catchErrors(timeout(nativeNumber, 10), TimeoutError);
type _timeoutN = Assert<Eq<FailureOf<typeof timeoutN>, TimeoutError | Unlisted>>;
type _waitForN = Assert<Eq<FailureOf<typeof waitForN>, TimeoutError | Unlisted>>;
type _fetchN = Assert<Eq<FailureOf<typeof fetchN>, TypeError | Unlisted>>;
type _timeoutCaught = Assert<Eq<FailureOf<typeof timeoutCaught>, Unlisted>>;

// timeout keeps the input failure next to its own
const timeoutF = timeout(f, 1);
const timeoutU = timeout(u, 1);
const timeoutNat = timeout(nativeNumber, 1);
const timeoutBare = timeout(1);
const timeoutThunkF = timeout(() => f, 1);
type _timeoutF = Assert<Eq<FailureOf<typeof timeoutF>, FooError | TimeoutError | Unlisted>>;
type _timeoutU = Assert<Eq<FailureOf<typeof timeoutU>, unknown>>;
type _timeoutNat = Assert<Eq<FailureOf<typeof timeoutNat>, TimeoutError | Unlisted>>;
type _timeoutBare = Assert<Eq<typeof timeoutBare, CancelablePromise<never, TimeoutError | Unlisted>>>;
type _timeoutThunkF = Assert<Eq<FailureOf<typeof timeoutThunkF>, FooError | TimeoutError | Unlisted>>;
type _timeoutFValue = Assert<Eq<typeof timeoutF, CancelablePromise<number, FooError | TimeoutError | Unlisted>>>;
export const timeoutFReason = timeout(f, 1).catch((e) => e.response);

// pass-through helpers keep a declared failure closed
const minDelayF = minDelay(f, 10);
const delayF = delay(f, 10);
type _minDelayF = Assert<Eq<FailureOf<typeof minDelayF>, FooError>>;
type _delayF = Assert<Eq<FailureOf<typeof delayF>, FooError>>;

// helpers that reject on their own stay open, and a cancellation stand-in is never listed
declare const fooJob: () => CancelablePromise<number, FooError>;
const mapPlain = map([1], (x) => x * 2);
const mapF = map([1], () => f);
const limitF = limit(1)(fooJob);
const debouncedF = debounce(fooJob, 10)();
type _mapPlain = Assert<Eq<FailureOf<typeof mapPlain>, AggregateErrorShape | Unlisted>>;
type _mapF = Assert<Eq<FailureOf<typeof mapF>, FooError | AggregateErrorShape | Unlisted>>;
type _limitF = Assert<Eq<FailureOf<typeof limitF>, FooError | Unlisted>>;
type _limitNoAbort = Assert<Eq<Exclude<FailureOf<typeof limitF>, AbortError>, FailureOf<typeof limitF>>>;
type _debouncedF = Assert<Eq<FailureOf<typeof debouncedF>, FooError | Unlisted>>;
export const mapReason = map([1], (x) => x).catch((e) => e.errors);
export const limitReason = limit(1)(fooJob).catch((e) => e.name);
const coMap = cancAsync(function* () {
  const x = yield* cancAwait(map([1], (x) => x));
  return x;
});
type _coMap = Assert<Eq<FailureOf<ReturnType<typeof coMap>>, AggregateErrorShape>>;

// a coroutine step declares the library error only
const coTimeoutN = cancAsync(function* () {
  const x = yield* cancAwait(timeout(nativeNumber, 10));
  return x;
});
const coFetch = cancAsync(function* () {
  const res = yield* cancAwait(cancelableFetch('x'));
  return res;
});
type _coTimeoutN = Assert<Eq<FailureOf<ReturnType<typeof coTimeoutN>>, TimeoutError>>;
type _coFetch = Assert<Eq<FailureOf<ReturnType<typeof coFetch>>, TypeError>>;
const coTimeoutF = cancAsync(function* () {
  const x = yield* cancAwait(timeout(f, 1));
  return x;
});
type _coTimeoutF = Assert<Eq<FailureOf<ReturnType<typeof coTimeoutF>>, FooError | TimeoutError>>;

const withResolversU = CancelablePromise.withResolvers<string>();
type _withResolversU = Assert<Eq<FailureOf<typeof withResolversU.promise>, unknown>>;

// an undeclared promise does not fit a declared slot
declare function takeFoo(p: CancelablePromise<number, FooError>): void;
declare function takeNever(p: CancelablePromise<number, never>): void;
declare function takeAbort(p: CancelablePromise<number, AbortError>): void;
declare function takeBar(p: CancelablePromise<number, BarError>): void;
declare const timedOut: CancelablePromise<number, TimeoutError>;

// prettier-ignore
// @ts-expect-error undeclared into a declared slot
takeFoo(u);
// prettier-ignore
// @ts-expect-error undeclared into a declares-nothing slot
takeNever(u);
// prettier-ignore
// @ts-expect-error undeclared into a declared annotation
export const undeclaredIntoFoo: CancelablePromise<number, FooError> = u;
// prettier-ignore
// @ts-expect-error mix with an undeclared member into a declared slot
takeFoo(raceUF);

// declared mismatches still error
// prettier-ignore
// @ts-expect-error branded mismatch
takeAbort(timedOut);
// prettier-ignore
// @ts-expect-error name mismatch
takeBar(f);
// prettier-ignore
// @ts-expect-error declared executor rejects outside its set
export const outsideSet = new CancelablePromise<number, FooError>((_r, rej) => rej(new BarError()));

// declared or empty into one-argument and wider slots, as on 1.0
takeFoo(n);
export const declaredIntoOneArg: CancelablePromise<number> = f;
export const declaredIntoWider: CancelablePromise<number, FooError | BarError> = f;
export const mixIntoOneArg: CancelablePromise<number> = raceFG;

// 1.0 coroutine bodies that no longer compile, each step now declares its failure
declare const nativeP: Promise<number>;
declare const url: string;

// documented break: the step declares its failure
// prettier-ignore
// @ts-expect-error reason is the aggregate error
export const breakAny = cancAsync(function* () { return yield* cancAwait.any([u, nativeP]); })().catch((e) => e.code);
// documented break: the step declares its failure
// prettier-ignore
// @ts-expect-error reason is the timeout error
export const breakTimeoutNative = cancAsync(function* () { return yield* cancAwait(timeout(nativeP, 10)); })().catch((e) => e.response);
// an undeclared input keeps the timeout step undeclared, so the 1.0 body compiles
// prettier-ignore
export const timeoutOneArgStepReason = cancAsync(function* () { return yield* cancAwait(timeout(u, 10)); })().catch((e) => e.response);
// documented break: the step declares its failure
// prettier-ignore
// @ts-expect-error reason is the timeout error
export const breakFetch = cancAsync(function* () { const r = yield* cancAwait(cancelableFetch(url)); return r.status; })().catch((e) => e.code);

// axios requests declare AxiosError inside an open set, so a raw reason body keeps compiling
declare const axiosUrl: string;
export const axiosReason = canc.get(axiosUrl).catch((e) => e.code);
export const axiosPostReason = canc.post(axiosUrl, {}).catch((e) => e.code);
const axiosGet = canc.get(axiosUrl);
const axiosRequest = canc.request({ url: axiosUrl });
const axiosPost = canc.post(axiosUrl);
const axiosCall = canc(axiosUrl);
type _axiosGet = Assert<Eq<FailureOf<ReturnType<typeof canc.get>>, AxiosError<unknown, unknown> | Unlisted>>;
type _axiosRequest = Assert<Eq<FailureOf<ReturnType<typeof canc.request>>, AxiosError<unknown, unknown> | Unlisted>>;
type _axiosPost = Assert<Eq<FailureOf<ReturnType<typeof canc.post>>, AxiosError<unknown, unknown> | Unlisted>>;
type _axiosCall = Assert<Eq<FailureOf<typeof axiosCall>, AxiosError<any, any> | Unlisted>>;
type _axiosGetValue = Assert<Eq<FailureOf<typeof axiosGet>, AxiosError<any, any> | Unlisted>>;
type _axiosRequestValue = Assert<Eq<FailureOf<typeof axiosRequest>, AxiosError<any, any> | Unlisted>>;
type _axiosPostValue = Assert<Eq<FailureOf<typeof axiosPost>, AxiosError<any, any> | Unlisted>>;

// a coroutine step declares the axios error only
const coAxios = cancAsync(function* () {
  const res = yield* cancAwait(canc.get(axiosUrl));
  return res.status;
});
type _coAxios = Assert<Eq<FailureOf<ReturnType<typeof coAxios>>, AxiosError<any, any>>>;
