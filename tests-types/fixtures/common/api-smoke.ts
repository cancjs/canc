/**
 * API-smoke fixture. Imports the ENTIRE public surface of the BUILT
 * `@cancjs/promise` package (resolved from the installed tarball, never from
 * src) and uses each exported value/type in a way that forces the compiler to
 * actually resolve and check the shipped `.d.ts`. Compiled once per TS version
 * in the matrix. Must stay compatible down to the TS 4.2 floor: no top-level
 * `satisfies`, no `const` type params, no `using`, no template-literal-type
 * gymnastics here — keep it to what a real 4.2 consumer could write.
 *
 * This file is deliberately runtime-dead (nothing executes); it exists purely
 * to make `tsc --noEmit` chew through the types.
 */
import CancelablePromise, {
 CancelablePromise as NamedCP,
 CancelError,
 isCancelError,
 createCancelSignal,
 catchCancel,
 suppressCancel,
 makeCancelable,
} from '@cancjs/promise';

import {
  catchAbort,
  suppressAbort,
  catchTimeout,
  suppressTimeout,
  createCatchError,
  createSuppressError,
} from '@cancjs/toolbox';

import {
  catchAbort as nativeCatchAbort,
  suppressAbort as nativeSuppressAbort,
  catchTimeout as nativeCatchTimeout,
  suppressTimeout as nativeSuppressTimeout,
  createCatchError as nativeCreateCatchError,
  createSuppressError as nativeCreateSuppressError,
  AbortError as NativeAbortError,
  TimeoutError as NativeTimeoutError,
} from '@cancjs/toolbox-native';

// coroutine (cancAsync/cancAwait) lives in its own package now; core no longer re-exports it.
import { async as cancAsync, await as cancAwait } from '@cancjs/coroutine';

import type {
 ICancelablePromiseOptions,
 ICancelablePromiseFlagOptions,
 ICancelablePromiseWithResolvers,
 ICancelable,
 IHandleCancelOptions,
 TCancelReason,
 TCancelablePromiseStates,
 TOnCancel,
} from '@cancjs/promise';

// --- default export identity ---------------------------------------------
const _sameClass: typeof NamedCP = CancelablePromise;
void _sameClass;

// --- constructor + executor + options generics ---------------------------
const p = new CancelablePromise<number>((resolve, reject, ctx) => {
  ctx.handleCancel((reason?: TCancelReason) => void reason);
 reject(new Error('x'));
 resolve(1);
}, { bubble: true, strict: false, shield: true, asyncCancel: true, forceCancelable: false });

// flag options object typed on its own
const _flags: ICancelablePromiseFlagOptions = { bubble: false };
const _opts: ICancelablePromiseOptions = { ..._flags, signal: createCancelSignal().signal };
void _opts;

// --- then / catch / finally result types ---------------------------------
const pThen = p.then((n) => `${n}`); // CancelablePromise<string>
const pCatch = pThen.catch(() => 42); // CancelablePromise<string | number>
const pFinally = pCatch.finally(() => {}); // CancelablePromise<string | number>
void pFinally;

// handleCancel returns the same promise type + accepts options
const _hc: CancelablePromise<number> = p.handleCancel(() => {}, { immediate: true } as IHandleCancelOptions);
void _hc;

// --- instance getters / cancel -------------------------------------------
const _canceled: boolean = p.isCanceled;
const _cancelable: boolean = p.isCancelable;
const _cancelRet: void | CancelablePromise<PromiseSettledResult<unknown>[]> = p.cancel('done');
void _canceled; void _cancelable; void _cancelRet;

// --- static combinators: tuple inference ---------------------------------
const pAll = CancelablePromise.all([
 Promise.resolve(1),
 Promise.resolve('a'),
 Promise.resolve(true),
]); // CancelablePromise<[number, string, boolean]>
void pAll;

const pAllSettled = CancelablePromise.allSettled([Promise.resolve(1), Promise.resolve('a')] as const);
void pAllSettled;

const pRace = CancelablePromise.race([Promise.resolve(1), Promise.resolve(2)]);
void pRace;

const pAny = CancelablePromise.any([Promise.resolve(1), Promise.resolve('a')] as const);
void pAny;

// --- resolve / reject / withResolvers ------------------------------------
const pResolve = CancelablePromise.resolve(123);
const pResolveVoid = CancelablePromise.resolve();
const pReject = CancelablePromise.reject<number>('nope');
void pResolve; void pResolveVoid; void pReject;

const wr: ICancelablePromiseWithResolvers<string> = CancelablePromise.withResolvers<string>();
wr.resolve('ok');
wr.reject('bad');
wr.cancel('stop');
const _wrPromise: CancelablePromise<string> = wr.promise;
void _wrPromise;

// --- coroutine: cancAwait yield* inference + cancAsync --------------------
const coro = cancAsync(function* () {
 const n: number = yield* cancAwait(Promise.resolve(1)); // yield* typed as awaited value
 const s: string = yield* cancAwait('literal'); // sync value passthrough
 return n + s.length;
});
const _coroResult = coro(); // CancelablePromise<unknown>
void _coroResult;

// --- helpers -------------------------------------------------------------
const _isErr: boolean = isCancelError(new CancelError());
const _cc = catchCancel(Promise.resolve(5), { bubble: false, abort: true }); // CancelablePromise<number | CancelError>
const _sc = suppressCancel(Promise.resolve(5)); // CancelablePromise<number | void>
const _mc = makeCancelable(Promise.resolve(5)); // CancelablePromise<number>
const _ca = catchAbort(Promise.resolve(5));
const _sa = suppressAbort(Promise.resolve(5));
const _ct = catchTimeout(Promise.resolve(5));
const _st = suppressTimeout(Promise.resolve(5));
const _cce = createCatchError('AbortError');
const _cse = createSuppressError('TimeoutError');
const _nca = nativeCatchAbort(Promise.resolve(5));
const _nsa = nativeSuppressAbort(Promise.resolve(5));
const _nct = nativeCatchTimeout(Promise.resolve(5));
const _nst = nativeSuppressTimeout(Promise.resolve(5));
const _ncce = nativeCreateCatchError('AbortError');
const _ncse = nativeCreateSuppressError('TimeoutError');
declare const _n: NativeAbortError;
declare const _nt: NativeTimeoutError;
void _isErr; void _cc; void _sc; void _mc; void _ca; void _sa; void _ct; void _st; void _cce; void _cse;
void _nca; void _nsa; void _nct; void _nst; void _ncce; void _ncse; void _n; void _nt;

// --- interface/type-only surface -----------------------------------------
const _state: TCancelablePromiseStates = 'PENDING';
const _onCancel: TOnCancel = () => {};
const _cancelable2: ICancelable<number> = p;
void _state; void _onCancel; void _cancelable2;

// --- CancelError shape ---------------------------------------------------
const err = new CancelError('reason', { cause: new Error('c') });
const _bubbled: boolean = err.bubbled;
const _disposed: boolean = err.disposed;
void _bubbled; void _disposed;

export {};
