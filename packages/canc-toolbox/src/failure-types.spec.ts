import { CancelablePromise, FailureOf, TimeoutError } from '@cancjs/promise';

import { Eq } from '../../../tests-types/fixtures/common/assert-type';
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
  it('types failures correctly', () => {
    const p1: CancelablePromise<void, never> = delay(100);
    const p2: CancelablePromise<never, TimeoutError> = timeout(100);
    const p3: CancelablePromise<void, TimeoutError> = waitFor(() => true);
    const p4: CancelablePromise<number, Error> = retry<number, Error>(() => 1);
    const p5: CancelablePromise<number, TypeError> = minDelay<number, TypeError>(1, 100);

    const d = debounce<[string], void, Error>(() => {}, 100);
    const p6: CancelablePromise<void, Error> = d('x');

    const t = throttle<[string], void, Error>(() => {}, 100);
    const p7: CancelablePromise<void, Error> = t('x');

    const pr = promisify(() => {});
    const p8: CancelablePromise<any, never> = pr();

    const df = defer();
    const p9: CancelablePromise<void, never> = df.promise;

    p1.cancel();
    p2.cancel();
    p3.cancel();
    p4.cancel();
    p5.cancel();
    p6.cancel();
    p7.cancel();
    p8.cancel();
    p9.cancel();
    d.cancel();
    t.cancel();
  });
});
