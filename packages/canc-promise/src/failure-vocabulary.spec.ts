import { Assert, Eq } from '../../../tests-types/fixtures/common/assert-type';
import {
  CancelablePromise,
  Failing,
  FAILURE,
  FailureOf,
  ResultOf,
  TReason,
  WithFailure,
  withFailure,
} from './cancelable-promise';

class FooError extends Error {
  name = 'FooError';
}

class BarError extends Error {
  name = 'BarError';
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
    // unlike FailureOf's never fallback (see asymmetry comment beside definitions)
    const _check2: Assert<Eq<ResultOf<number>, number>> = true;
    const _check3: Assert<Eq<ResultOf<Promise<string>>, string>> = true;
  });

  it('WithFailure widens the declared failure set as a checked annotation', () => {
    const plainCancPromise = null as unknown as CancelablePromise<number>;
    const pFoo = null as unknown as CancelablePromise<number, FooError>;

    // 1. widening from `never`: realistic makeCancelable(p) starting point, no cast
    const a: WithFailure<CancelablePromise<number>, FooError> = plainCancPromise;

    // 2. widening an already-declared set, no cast
    const b: WithFailure<CancelablePromise<number, FooError>, BarError> = pFoo;
    const _bCheck: Assert<Eq<typeof b, CancelablePromise<number, FooError | BarError>>> = true;

    // 3. narrowing does NOT compile: WithFailure only ever adds, so a promise already declaring a
    // failure cannot satisfy a WithFailure annotation that ends up narrower than the source.
    // @ts-expect-error TS2322 Narrowing rejected: WithFailure only widens
    const c: WithFailure<CancelablePromise<number>, never> = pFoo;

    // 4. the `extends CancelablePromise<any, any>` constraint rejects a non-canc promise with a
    // readable error instead of silently producing something.
    // @ts-expect-error TS2344 Promise fails the CancelablePromise constraint
    type _ConstraintViolation = WithFailure<Promise<number>, FooError>;

    // 5. documented limitation: applied to a subclass, WithFailure still yields CancelablePromise,
    // not the subclass, because a conditional type cannot reconstruct an arbitrary subclass with
    // different type arguments.
    class Sub<T, F = never> extends CancelablePromise<T, F> {}
    const sub = null as unknown as Sub<number, FooError>;
    const subWidened: WithFailure<Sub<number, FooError>, BarError> = sub;
    const _subCheck: Assert<Eq<typeof subWidened, CancelablePromise<number, FooError | BarError>>> = true;

    void [a, b, c, subWidened];
  });

  it('withFailure narrows/replaces an already-declared set, value type intact, no-op at runtime', () => {
    const pBoth = null as unknown as CancelablePromise<number, FooError | BarError>;
    const pFoo = null as unknown as CancelablePromise<number, FooError>;

    // 1. narrows where WithFailure (the annotation) refuses: FooError | BarError -> FooError alone
    const narrowed = withFailure<FooError>()(pBoth);
    const _narrowedCheck: Assert<Eq<typeof narrowed, CancelablePromise<number, FooError>>> = true;

    // 2. replaces rather than adds: FooError -> BarError, not FooError | BarError
    const replaced = withFailure<BarError>()(pFoo);
    const _replacedCheck: Assert<Eq<typeof replaced, CancelablePromise<number, BarError>>> = true;

    // 3. value type survives: inferred in second call, never widened to any
    const stringSource = null as unknown as CancelablePromise<string, FooError>;
    const stillString = withFailure<BarError>()(stringSource);
    const _valueCheck: Assert<Eq<typeof stillString, CancelablePromise<string, BarError>>> = true;

    // 4. runtime no-op: the returned reference is the SAME object, nothing rewrapped or checked
    const real = CancelablePromise.resolve(1) as unknown as CancelablePromise<number, FooError>;
    const relabeled = withFailure<BarError>()(real);
    expect(relabeled).toBe(real);

    void [narrowed, replaced, stillString];
  });
});
