import { Assert, Eq } from '../../../tests-types/fixtures/common/assert-type';
import { Failing, FAILURE, FailureOf, TReason } from './cancelable-promise';

class FooError extends Error {
  name = 'FooError';
}

describe('Failure vocabulary', () => {
  it('FAILURE is a unique symbol', () => {
    expect(typeof FAILURE).toBe('symbol');
    expect(FAILURE).toBe(Symbol.for('@cancjs/promise:failure'));
  });

  it('types behave as expected', () => {
    const _check1: Assert<Eq<FailureOf<number>, never>> = true;
    const _check2: Assert<Eq<FailureOf<Promise<string>>, never>> = true;
    const _check3: Assert<Eq<FailureOf<Failing<FooError>>, FooError>> = true;
    const _check4: Assert<Eq<TReason<never>, unknown>> = true;
    const _check5: Assert<Eq<TReason<FooError>, FooError>> = true;
  });
});
