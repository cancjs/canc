/**
 * Failure-channel fixture for the TS matrix harness.
 *
 * Compiled in every lane, so it must stay inside the lowest TS version the matrix pins.
 *
 * Every check here is an identity assertion. An annotated assignment only proves assignability,
 * and the failure channel is covariant: `CancelablePromise<string, never>` is assignable to
 * `CancelablePromise<string, MatrixError>`, so a build that erased the declared failure would
 * still satisfy an annotation. Identity is the only assertion that can go red.
 *
 * The two error classes below carry distinct members on purpose. Two structurally identical
 * classes are the same type, which makes every subtraction and every narrowing check pass for
 * the wrong reason.
 */
import type { Failing, FailureOf, TReason } from '@cancjs/promise';
import CancelablePromise, {
  AbortError,
  CancelError,
  catchCancel,
  catchErrors,
  createIsError,
  FAILURE,
  isAbortError,
  isErrorOf,
  suppressErrors,
  TimeoutError,
} from '@cancjs/promise';

import type { Assert, Eq } from './assert-type';

class MatrixError extends Error {
  readonly code = 'one';
}

class MatrixErrorTwo extends Error {
  readonly code = 'two';
}

// The classes must not collapse into one type, or nothing below is a real test.
type _distinctErrors = Assert<Eq<Eq<MatrixError, MatrixErrorTwo>, false>>;

// ============================================================ failure vocabulary
declare const failing: Failing<MatrixError>;
type _failingReadsBrand = Assert<Eq<FailureOf<typeof failing>, MatrixError>>;

// FailureOf reads the optional brand key, so a bare object carrying it declares a failure too.
declare const branded: { readonly [FAILURE]?: MatrixError };
type _brandedReadsBrand = Assert<Eq<FailureOf<typeof branded>, MatrixError>>;

// A value with no brand has no declared failure.
type _unbrandedHasNoFailure = Assert<Eq<FailureOf<number>, never>>;

// TReason widens to unknown only when nothing is declared.
type _reasonOfDeclared = Assert<Eq<TReason<MatrixError>, MatrixError>>;
type _reasonOfUndeclared = Assert<Eq<TReason<never>, unknown>>;

// ============================================================ declared promise
const declared = CancelablePromise.reject<number, MatrixError>(new MatrixError('test'));
type _declared = Assert<Eq<typeof declared, CancelablePromise<number, MatrixError>>>;
type _declaredFailure = Assert<Eq<FailureOf<typeof declared>, MatrixError>>;

const undeclared = CancelablePromise.resolve(1);
type _undeclared = Assert<Eq<typeof undeclared, CancelablePromise<number, never>>>;

// ============================================================ chaining
// Detectors for a chain that drops the declared failure.
//
// `finally` is a single non-generic signature, so its failure can be read straight off the method
// type with no call site at all. `then` and `catch` are overloaded generics, and `ReturnType` on
// those instantiates the last overload with `any`, which swallows every assertion (`FailureOf<any>`
// is `unknown`). So `then` is probed by the callback-free call instead: nothing there can
// introduce a failure, so whatever comes out is what the declared channel propagated.
type _finallyKeepsFailure = Assert<Eq<FailureOf<ReturnType<typeof declared.finally>>, MatrixError>>;
type _finallyReturn = Assert<Eq<ReturnType<typeof declared.finally>, CancelablePromise<number, MatrixError>>>;

const forwarded = declared.then();
type _forwarded = Assert<Eq<typeof forwarded, CancelablePromise<number, MatrixError>>>;
type _forwardedFailure = Assert<Eq<FailureOf<typeof forwarded>, MatrixError>>;

const chained = declared.then((n) => `${n}`);
type _chained = Assert<Eq<typeof chained, CancelablePromise<string, MatrixError>>>;
type _chainedFailure = Assert<Eq<FailureOf<typeof chained>, MatrixError>>;

// Handling the rejection clears the channel, so the fixture fails on a too-wide result as well.
const handled = declared.then(
  (n) => n,
  () => 0,
);
type _handled = Assert<Eq<typeof handled, CancelablePromise<number, never>>>;

const caught = declared.catch(() => 0);
type _caught = Assert<Eq<typeof caught, CancelablePromise<number, never>>>;

const finalled = declared.finally(() => {});
type _finalled = Assert<Eq<typeof finalled, CancelablePromise<number, MatrixError>>>;

// ============================================================ subtraction
declare const declaredBoth: CancelablePromise<number, MatrixError | MatrixErrorTwo>;

const subtracted = catchErrors(declaredBoth, MatrixError);
type _subtracted = Assert<Eq<typeof subtracted, CancelablePromise<number | MatrixError, MatrixErrorTwo>>>;

const suppressed = suppressErrors(declaredBoth, MatrixErrorTwo);
type _suppressed = Assert<Eq<typeof suppressed, CancelablePromise<number | void, MatrixError>>>;

const cancelCaught = catchCancel(declared);
type _cancelCaught = Assert<Eq<typeof cancelCaught, CancelablePromise<number | CancelError, MatrixError>>>;

// ============================================================ guard narrowing
declare const raw: unknown;
if (isErrorOf(raw, MatrixError)) {
  // The narrowed binding is inferred, never annotated, so the assertion sees what the guard did.
  const narrowed = raw;
  const narrowedCheck: Eq<typeof narrowed, MatrixError> = true;
  void narrowedCheck;
}

const isMatrixError = createIsError(MatrixError, MatrixErrorTwo);
declare const rawTwo: unknown;
if (isMatrixError(rawTwo)) {
  const narrowedUnion = rawTwo;
  const narrowedUnionCheck: Eq<typeof narrowedUnion, MatrixError | MatrixErrorTwo> = true;
  void narrowedUnionCheck;
}

// ============================================================ error identity
// The shared error classes tell themselves apart by their brand, not by a literal `name`. This
// fixture compiles in every lane, so it is also where the brand is checked against the downlevel
// bundle rather than only against the current-TypeScript types.
type _abortIsNotTimeout = Assert<Eq<Eq<AbortError, TimeoutError>, false>>;

// A bare Error is not one of them: the brand is a required member of the instance type.
// @ts-expect-error - a bare Error carries no brand
const _bareErrorIsNotAbort: AbortError = new Error('nope');
void _bareErrorIsNotAbort;

// `name` is plain `string`, so a subclass is free to rename itself. A literal would reject both of
// these, which is the reason the brand carries identity instead.
class RenamedAbort extends AbortError {
  constructor() {
    super();
    this.name = 'RenamedAbort';
  }
}
class RedeclaredAbort extends AbortError {
  declare name: string;
}
void RenamedAbort;
void RedeclaredAbort;

// The guard narrows to the branded instance type, not to a bare Error.
declare const rawAbort: unknown;
if (isAbortError(rawAbort)) {
  const narrowedAbort = rawAbort;
  const narrowedAbortCheck: Eq<typeof narrowedAbort, AbortError> = true;
  void narrowedAbortCheck;
}

export {};
