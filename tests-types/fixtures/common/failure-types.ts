/**
 * Failure-channel fixture for TS matrix harness.
 * Tests declared failure types down to TS 4.2 floor.
 * Must stay compatible down to TS 4.2 floor.
 */
import CancelablePromise, {
  FAILURE,
  CancelError,
  catchErrors,
  suppressErrors,
  isErrorOf,
  createIsError,
  catchCancel,
} from '@cancjs/promise';
import type { FailureOf, Failing, TReason } from '@cancjs/promise';

class MatrixError extends Error {
  name: string = 'MatrixError';
}

class MatrixErrorTwo extends Error {
  name: string = 'MatrixErrorTwo';
}

// 1. One declared promise
const pDeclared: CancelablePromise<number, MatrixError> = CancelablePromise.reject<number, MatrixError>(
  new MatrixError('test'),
);

// Verify failure vocabulary
type F = FailureOf<typeof pDeclared>;
type R = TReason<F>;
const _fCheck: F = new MatrixError('test');
const _rCheck: R = _fCheck;
void _fCheck;
void _rCheck;

// 2. One chain
const pChain: CancelablePromise<string, MatrixError> = pDeclared.then((n) => `${n}`);
void pChain;

// 3. One helper subtraction
const pSub: CancelablePromise<number | MatrixError, never> = catchErrors(pDeclared, MatrixError);
const pSubCancel: CancelablePromise<number | CancelError, MatrixError> = catchCancel(pDeclared);
void pSub;
void pSubCancel;

// 4. One guard narrowing
declare const err: unknown;
if (isErrorOf(err, MatrixError)) {
  const _guarded: MatrixError = err;
  void _guarded;
}

const isMatrixErr = createIsError(MatrixError, MatrixErrorTwo);
declare const err2: unknown;
if (isMatrixErr(err2)) {
  const _guarded2: MatrixError | MatrixErrorTwo = err2;
  void _guarded2;
}

export {};
