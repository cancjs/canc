/**
 * Type-level assertion suite. Compiled only in the `latest` TS lane of the
 * TS-version matrix (matrix.config.json → version with `typeAssertions:true`).
 *
 * Each `type _NN = Expect<Equal<Actual, Expected>>` line is a real assertion:
 * if the shipped `.d.ts` ever changes the inferred type, `Equal` becomes `false`
 * and `Expect<false>` fails compilation. Every area also has at least one
 * intentional-error case guarded by `@ts-expect-error` — those LINES must error;
 * if the type surface drifts so they stop erroring, `tsc` reports the unused
 * directive and the lane goes red. So both a too-loose and a too-strict drift
 * are caught.
 *
 * Assertions are pinned to the ACTUAL current contract (e.g. `cancAsync` is
 * declared to return `CancelablePromise<unknown>` today — asserted as such;
 * tighten here in lockstep if P?-? ever narrows that return).
 */
import CancelablePromise, {
 CancelError,
 catchCancel,
 suppressCancel,
 makeCancelable,
} from '@cancjs/promise';
import type {
 ICancelablePromiseWithResolvers,
 ICancelablePromiseFlagOptions,
 ICancelablePromiseOptions,
 ICatchErrorFn,
 ISuppressErrorFn,
} from '@cancjs/promise';
import type { Equal, Expect } from './assert-type';

// @ts-expect-error AbortError is no longer a public export of @cancjs/promise
import { AbortError } from '@cancjs/promise';
void AbortError;

// @ts-expect-error suppress is no longer exported by @cancjs/toolbox
import { suppress } from '@cancjs/toolbox';
void suppress;

import {
  catchAbort,
  suppressAbort,
  catchTimeout,
  suppressTimeout,
  createCatchError,
  createSuppressError,
  AbortError as ToolboxAbortError,
  TimeoutError as ToolboxTimeoutError,
} from '@cancjs/toolbox';

declare const p: CancelablePromise<number>;

// ============================================================ then/catch/finally
const then1 = p.then((n) => `${n}`);
type _then1 = Expect<Equal<typeof then1, CancelablePromise<string>>>;

// no onRejected → result carries just the fulfilled mapping
const then2 = p.then((n) => n * 2);
type _then2 = Expect<Equal<typeof then2, CancelablePromise<number>>>;

// onFulfilled + onRejected → union of both branches
const then3 = p.then((n) => `${n}`, () => 0);
type _then3 = Expect<Equal<typeof then3, CancelablePromise<string | number>>>;

const caught = p.catch(() => 'fallback');
type _catch1 = Expect<Equal<typeof caught, CancelablePromise<number | string>>>;

const finalled = p.finally(() => {});
type _finally1 = Expect<Equal<typeof finalled, CancelablePromise<number>>>;

// @ts-expect-error finally callback takes no value argument
p.finally((value: number) => value);

// ============================================================ combinator tuples
// all() heterogeneous tuple inference across the fixed-arity overloads.
const all2 = CancelablePromise.all([Promise.resolve(1), Promise.resolve('a')]);
type _all2 = Expect<Equal<typeof all2, CancelablePromise<[number, string]>>>;

const all3 = CancelablePromise.all([Promise.resolve(1), Promise.resolve('a'), Promise.resolve(true)]);
type _all3 = Expect<Equal<typeof all3, CancelablePromise<[number, string, boolean]>>>;

// 10-arity is the last fixed overload before the variadic fallback — spot-check it.
const all10 = CancelablePromise.all([
 Promise.resolve(1), Promise.resolve('a'), Promise.resolve(true),
 Promise.resolve(4), Promise.resolve('e'), Promise.resolve(6),
 Promise.resolve('g'), Promise.resolve(8), Promise.resolve('i'), Promise.resolve(10),
]);
type _all10 = Expect<Equal<
 typeof all10,
 CancelablePromise<[number, string, boolean, number, string, number, string, number, string, number]>
>>;

// homogeneous array (not a tuple literal) → element array, not a tuple
const allArr = CancelablePromise.all([Promise.resolve(1), Promise.resolve(2)] as Promise<number>[]);
type _allArr = Expect<Equal<typeof allArr, CancelablePromise<number[]>>>;

const race = CancelablePromise.race([Promise.resolve(1), Promise.resolve(2)]);
type _race = Expect<Equal<typeof race, CancelablePromise<number>>>;

const any = CancelablePromise.any([Promise.resolve(1), Promise.resolve('a')] as const);
type _any = Expect<Equal<typeof any, CancelablePromise<number | string>>>;

// @ts-expect-error all() requires an iterable, not a bare value
CancelablePromise.all(123);

// ============================================================ Awaited unwrapping
const resNested = CancelablePromise.resolve(Promise.resolve(5));
type _resAwait = Expect<Equal<typeof resNested, CancelablePromise<number>>>;

const allSettled = CancelablePromise.allSettled([Promise.resolve(1), Promise.resolve('a')] as const);
type _allSettled = Expect<Equal<
 typeof allSettled,
 CancelablePromise<[PromiseSettledResult<number>, PromiseSettledResult<string>]>
>>;

// ============================================================ withResolvers
const wr = CancelablePromise.withResolvers<string>();
type _wr = Expect<Equal<typeof wr, ICancelablePromiseWithResolvers<string>>>;
type _wrPromise = Expect<Equal<typeof wr.promise, CancelablePromise<string>>>;
type _wrResolveArg = Expect<Equal<Parameters<typeof wr.resolve>[0], string | PromiseLike<string>>>;

// @ts-expect-error resolve() is typed to the promise value, not an arbitrary shape
wr.resolve(123);

// coroutine (cancAsync / cancAwait) type assertions live in ./coroutine-types.ts
// (the @cancjs/coroutine package owns that surface after the coroutine extraction).

// ============================================================ helpers
const cc = catchCancel(Promise.resolve(7));
type _catchCancel = Expect<Equal<typeof cc, CancelablePromise<number | CancelError>>>;

const ccOpt = catchCancel(Promise.resolve(7), { bubble: false, abort: true });
type _catchCancelOpt = Expect<Equal<typeof ccOpt, CancelablePromise<number | CancelError>>>;

const sc = suppressCancel(Promise.resolve(7));
type _suppressCancel = Expect<Equal<typeof sc, CancelablePromise<number | void>>>;

const mc = makeCancelable(Promise.resolve(7));
type _makeCancelable = Expect<Equal<typeof mc, CancelablePromise<number>>>;

// @ts-expect-error catchCancel over a value narrows to CancelError | never, not a promise-of-value
const _bad: CancelablePromise<number> = catchCancel(new CancelError());

const ca = catchAbort(Promise.resolve(7));
type _catchAbort = Expect<Equal<typeof ca, CancelablePromise<number | Error>>>;

const sa = suppressAbort(Promise.resolve(7));
type _suppressAbort = Expect<Equal<typeof sa, CancelablePromise<number | void>>>;

const ct = catchTimeout(Promise.resolve(7));
type _catchTimeout = Expect<Equal<typeof ct, CancelablePromise<number | Error>>>;

const st = suppressTimeout(Promise.resolve(7));
type _suppressTimeout = Expect<Equal<typeof st, CancelablePromise<number | void>>>;

const cce = createCatchError(ToolboxAbortError);
type _createCatchError = Expect<Equal<typeof cce, ICatchErrorFn>>;

const cse = createSuppressError(ToolboxTimeoutError);
type _createSuppressError = Expect<Equal<typeof cse, ISuppressErrorFn>>;

// ============================================================ option interfaces
// flag options are all optional booleans; adding an unknown key is rejected.
const flags: ICancelablePromiseFlagOptions = { asyncCancel: true, bubble: false, shield: true, strict: false, forceCancelable: true };
void flags;
type _flagKeys = Expect<Equal<
 keyof ICancelablePromiseFlagOptions,
 'asyncCancel' | 'forceCancelable' | 'bubble' | 'strict' | 'shield'
>>;

const opts: ICancelablePromiseOptions = { bubble: true };
void opts;

// @ts-expect-error unknown option key is rejected by excess-property checking
const _badOpts: ICancelablePromiseFlagOptions = { notAnOption: true };

// cancelify does not accept lazy option
import { cancelify } from '@cancjs/toolbox';
// @ts-expect-error cancelify omits the lazy option
const _cancelifyProbe = cancelify(() => 1, { lazy: true });
void _cancelifyProbe;

// the eagerly starting helpers omit the lazy option the same way
import { debounce, defer, minDelay, throttle } from '@cancjs/toolbox';
// @ts-expect-error minDelay omits the lazy option
const _minDelayProbe = minDelay(Promise.resolve(1), 10, { lazy: true });
void _minDelayProbe;
// @ts-expect-error defer omits the lazy option
const _deferProbe = defer<number>({ lazy: true });
void _deferProbe;
// @ts-expect-error debounce omits the lazy option
const _debounceProbe = debounce(() => 1, 10, { lazy: true });
void _debounceProbe;
// @ts-expect-error throttle omits the lazy option
const _throttleProbe = throttle(() => 1, 10, { lazy: true });
void _throttleProbe;

// ============================================================ cancelify call args
// The callback takes the call arguments as rest parameters, so the wrapper carries their types
// with no annotation ceremony at the call site. A tuple parameter had no inference site and
// collapsed to `any[]`, which silently dropped arity and argument checking on every wrapper.
const cancelifyOne = cancelify((_ctx, id: string) => Promise.resolve(id.length));
type _cancelifyOne = Expect<Equal<typeof cancelifyOne, (id: string) => CancelablePromise<number>>>;

// The destructured-context form infers the same way.
const cancelifyTwo = cancelify(({ getSignal }, id: string, limit: number) =>
 Promise.resolve(`${id}:${limit}:${typeof getSignal}`),
);
type _cancelifyTwo = Expect<
 Equal<typeof cancelifyTwo, (id: string, limit: number) => CancelablePromise<string>>
>;

const cancelifyNone = cancelify((_ctx) => 1);
type _cancelifyNone = Expect<Equal<typeof cancelifyNone, () => CancelablePromise<number>>>;

// @ts-expect-error the wrapper rejects an argument of the wrong type
cancelifyOne(42);
// @ts-expect-error the wrapper rejects a missing argument
cancelifyOne();
// @ts-expect-error the wrapper rejects an extra argument
cancelifyNone('nope');

export {};
