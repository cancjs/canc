import { Assert, Eq } from '../../../tests-types/fixtures/common/assert-type';
import { CancelablePromise, Failing, FAILURE, FailureOf, ResultOf, TReason } from './cancelable-promise';

class FooError extends Error {
  name = 'FooError';
}

describe('Failure vocabulary', () => {
  it('FAILURE is a unique symbol', () => {
    expect(typeof FAILURE).toBe('symbol');
    expect(FAILURE).toBe(Symbol.for('@cancjs/promise:failure'));
  });

  it('types behave as expected', () => {
    // regression pins: a bare value / plain promise never carries the phantom property, so
    // FailureOf must collapse to never, not unknown (cancAsync maps this over an entire
    // coroutine yield union; see the asymmetry comment beside FailureOf/ResultOf).
    const _check1: Assert<Eq<FailureOf<number>, never>> = true;
    const _check2: Assert<Eq<FailureOf<Promise<string>>, never>> = true;
    const _check3: Assert<Eq<FailureOf<Failing<FooError>>, FooError>> = true;
    const _check4: Assert<Eq<TReason<never>, unknown>> = true;
    const _check5: Assert<Eq<TReason<FooError>, FooError>> = true;
    // deliberate-widening pin: an explicit CancelablePromise<T, unknown> is a real declared
    // state, so FailureOf must keep reporting unknown faithfully, not collapse it to never.
    const _check6: Assert<Eq<FailureOf<CancelablePromise<number, unknown>>, unknown>> = true;
  });

  it('ResultOf extracts the resolved value', () => {
    const _check1: Assert<Eq<ResultOf<CancelablePromise<number, FooError>>, number>> = true;
    // ResultOf falls back to reporting the type itself (never unknown) on non-promise input,
    // unlike FailureOf's never fallback -- see the asymmetry comment beside both definitions.
    const _check2: Assert<Eq<ResultOf<number>, number>> = true;
    const _check3: Assert<Eq<ResultOf<Promise<string>>, string>> = true;
  });
});
