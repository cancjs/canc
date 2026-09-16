import { CancelablePromise, FailureOf, TimeoutError } from '@cancjs/promise';

import { Eq } from '../../../tests-types/fixtures/common/assert-type';
import { isTimeoutError } from '../../_util';
import {
  cancelify,
  debounce,
  defer,
  delay,
  lazy,
  minDelay,
  promisify,
  retry,
  throttle,
  timeout,
  waitFor,
} from './index';

// A distinct nominal shape, so an assertion cannot pass because two error types collapsed into one.
class HttpError extends Error {
  readonly status: number = 500;
}

declare const work: CancelablePromise<number, HttpError>;
declare const attemptWork: (attempt: number) => CancelablePromise<number, HttpError>;
declare const callWork: (id: string) => CancelablePromise<number, HttpError>;

// Identity assertions, never annotated assignments: the failure channel is covariant, so
// `CancelablePromise<number, never>` is assignable to `CancelablePromise<number, HttpError>` and an
// annotation would still pass on a helper that dropped the declared set.
//
// Each call passes no explicit type arguments, so the failure set can only come from the work
// handed in. Nothing here is called at runtime; the checks are the compilation itself, and the
// inputs above are declarations with no value behind them.
function _declaredFailures(): void {
  const _retried = retry(attemptWork);
  const _retryTakesFailureFromWork: Eq<typeof _retried, CancelablePromise<number, HttpError>> = true;

  const _floored = minDelay(work, 100);
  const _minDelayTakesFailureFromInput: Eq<typeof _floored, CancelablePromise<number, HttpError>> = true;

  const _delayed = delay(work, 100);
  const _delayTakesFailureFromInput: Eq<typeof _delayed, CancelablePromise<number, HttpError>> = true;

  const _debounced = debounce(callWork, 100);
  const _debounceTakesFailureFromWork: Eq<ReturnType<typeof _debounced>, CancelablePromise<number, HttpError>> = true;

  const _throttled = throttle(callWork, 100);
  const _throttleTakesFailureFromWork: Eq<ReturnType<typeof _throttled>, CancelablePromise<number, HttpError>> = true;

  // The helpers with nothing to read a failure set from declare none.
  const _bareDelay = delay(100);
  const _bareDelayDeclaresNothing: Eq<typeof _bareDelay, CancelablePromise<void, never>> = true;

  const _deferred = defer<number>();
  const _deferDeclaresNothing: Eq<typeof _deferred.promise, CancelablePromise<number, never>> = true;

  const _promisified = promisify((cb: (err: unknown, value: number) => void) => cb(null, 1));
  const _promisifyDeclaresNothing: Eq<ReturnType<typeof _promisified>, CancelablePromise<any, never>> = true;

  // Both wrap work and neither carries its declared set, which is why the docs say so.
  const _cancelified = cancelify((_ctx, id: string) => callWork(id));
  const _cancelifyDropsWorkFailure: Eq<ReturnType<typeof _cancelified>, CancelablePromise<number, never>> = true;

  const _lazied = lazy<number>((resolve) => resolve(callWork('x')));
  const _lazyDeclaresNothing: Eq<FailureOf<typeof _lazied>, never> = true;

  // The two helpers that declare a failure of their own.
  const _timedOut = timeout(100);
  const _timeoutDeclaresTimeout: Eq<typeof _timedOut, CancelablePromise<never, TimeoutError>> = true;

  const _waited = waitFor(() => true);
  const _waitForDeclaresTimeout: Eq<typeof _waited, CancelablePromise<void, TimeoutError>> = true;

  // `timeout` adds its own failure and does not carry the input's, which is what the docs say.
  const _bounded = timeout(work, 100);
  const _timeoutDropsInputFailure: Eq<typeof _bounded, CancelablePromise<number, TimeoutError>> = true;

  void [
    _retryTakesFailureFromWork,
    _minDelayTakesFailureFromInput,
    _delayTakesFailureFromInput,
    _debounceTakesFailureFromWork,
    _throttleTakesFailureFromWork,
    _bareDelayDeclaresNothing,
    _deferDeclaresNothing,
    _promisifyDeclaresNothing,
    _cancelifyDropsWorkFailure,
    _lazyDeclaresNothing,
    _timeoutDeclaresTimeout,
    _waitForDeclaresTimeout,
    _timeoutDropsInputFailure,
  ];
}

describe('declared failure propagation', () => {
  it("carries the wrapped work's declared failures through retry", async () => {
    const failing = (attempt: number): CancelablePromise<number, HttpError> =>
      attempt < 2 ?
        CancelablePromise.reject<number, HttpError>(new HttpError('boom'))
      : CancelablePromise.resolve(attempt);

    const result = retry(failing, { retries: 3 });
    const _resultCarriesFailure: Eq<typeof result, CancelablePromise<number, HttpError>> = true;

    await expect(result).resolves.toBe(2);
    expect(_resultCarriesFailure).toBe(true);
  });
});

describe('failure type specs', () => {
  // The mirror of the block above: work that declares no failures must leave the channel empty
  // rather than inheriting a set from the helper, and the two timers must still declare their own.
  // No call passes an explicit type argument, so every answer below is inferred.
  it('declares only the failures the call itself can produce', async () => {
    const delayed = delay(0);
    const _delayOfNothingDeclaresNothing: Eq<typeof delayed, CancelablePromise<void, never>> = true;

    const retried = retry(() => 1);
    const _retryOfPlainWorkDeclaresNothing: Eq<typeof retried, CancelablePromise<number, never>> = true;

    const floored = minDelay(1, 0);
    const _minDelayOfPlainInputDeclaresNothing: Eq<typeof floored, CancelablePromise<number, never>> = true;

    const _debounced = debounce((_id: string) => {}, 0);
    const _debounceOfPlainWorkDeclaresNothing: Eq<ReturnType<typeof _debounced>, CancelablePromise<void, never>> = true;

    const _throttled = throttle((_id: string) => {}, 0);
    const _throttleOfPlainWorkDeclaresNothing: Eq<ReturnType<typeof _throttled>, CancelablePromise<void, never>> = true;

    const promisified = promisify((cb: (err: unknown, value: number) => void) => cb(null, 1));
    const _promisifyDeclaresNothing: Eq<ReturnType<typeof promisified>, CancelablePromise<any, never>> = true;

    const deferred = defer();
    const _deferDeclaresNothing: Eq<typeof deferred.promise, CancelablePromise<void, never>> = true;

    const timedOut = timeout(0);
    const _timeoutDeclaresTimeout: Eq<typeof timedOut, CancelablePromise<never, TimeoutError>> = true;

    const waited = waitFor(() => true);
    const _waitForDeclaresTimeout: Eq<typeof waited, CancelablePromise<void, TimeoutError>> = true;

    deferred.resolve();

    await expect(delayed).resolves.toBeUndefined();
    await expect(retried).resolves.toBe(1);
    await expect(floored).resolves.toBe(1);
    await expect(promisified()).resolves.toBe(1);
    await expect(deferred.promise).resolves.toBeUndefined();
    await expect(waited).resolves.toBeUndefined();

    // The declared TimeoutError is the one the call really rejects with.
    const timedOutReason: unknown = await timedOut.catch((reason: unknown) => reason);
    expect(isTimeoutError(timedOutReason)).toBe(true);

    for (const declared of [
      _delayOfNothingDeclaresNothing,
      _retryOfPlainWorkDeclaresNothing,
      _minDelayOfPlainInputDeclaresNothing,
      _debounceOfPlainWorkDeclaresNothing,
      _throttleOfPlainWorkDeclaresNothing,
      _promisifyDeclaresNothing,
      _deferDeclaresNothing,
      _timeoutDeclaresTimeout,
      _waitForDeclaresTimeout,
    ]) {
      expect(declared).toBe(true);
    }
  });
});
