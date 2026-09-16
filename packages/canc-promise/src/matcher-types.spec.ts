import { Assert, Eq } from '../../../tests-types/fixtures/common/assert-type';
import type {
  ICatchErrorFn,
  ISuppressErrorFn,
  MatchedError,
  MatchedOf,
  SubtractedError,
  SubtractedOf,
} from './error-matchers';
import { createCatchError, createSuppressError } from './index';

class FooError extends Error {
  declare name: 'FooError';
}

class BarError extends Error {
  declare name: 'BarError';
}

type CtorMatcher = typeof FooError;
type GuardMatcher = (e: any) => e is BarError;
type StringMatcher = 'RetryError';
type PredicateMatcher = (e: any) => boolean;

// 5. Both factory result shapes name a matcher list, but neither requires one to be written out
const _defaultCatchShape: ICatchErrorFn = createCatchError(TypeError);
const _defaultSuppressShape: ISuppressErrorFn = createSuppressError(TypeError);

describe('matcher type mappings', () => {
  it('type assertion helpers pass compile-time checks', () => {
    // 1. MatchedError assertions for all 4 matcher kinds
    const checkCtorMatched: Assert<Eq<MatchedError<CtorMatcher>, FooError>> = true;
    const checkGuardMatched: Assert<Eq<MatchedError<GuardMatcher>, BarError>> = true;
    const checkStringMatched: Assert<Eq<MatchedError<StringMatcher>, Error & { name: 'RetryError' }>> = true;
    const checkPredicateMatched: Assert<Eq<MatchedError<PredicateMatcher>, Error>> = true;

    // 2. SubtractedError assertions for all 4 matcher kinds
    const checkCtorSubtracted: Assert<Eq<SubtractedError<CtorMatcher>, FooError>> = true;
    const checkGuardSubtracted: Assert<Eq<SubtractedError<GuardMatcher>, BarError>> = true;
    const checkStringSubtracted: Assert<Eq<SubtractedError<StringMatcher>, Error & { name: 'RetryError' }>> = true;
    const checkPredicateSubtracted: Assert<Eq<SubtractedError<PredicateMatcher>, never>> = true;

    // 3. MatchedOf and SubtractedOf tuple assertions
    const checkMatchedOfTuple: Assert<Eq<MatchedOf<[CtorMatcher, GuardMatcher]>, FooError | BarError>> = true;
    const checkSubtractedOfTuple: Assert<Eq<SubtractedOf<[CtorMatcher, GuardMatcher]>, FooError | BarError>> = true;

    // 4. Load-bearing negative assertion: plain predicate subtracts NOTHING from failure set
    const checkPredicateSubtractsNothing: Assert<
      Eq<Exclude<FooError | BarError, SubtractedOf<[PredicateMatcher]>>, FooError | BarError>
    > = true;

    expect(checkCtorMatched).toBe(true);
    expect(checkGuardMatched).toBe(true);
    expect(checkStringMatched).toBe(true);
    expect(checkPredicateMatched).toBe(true);
    expect(checkCtorSubtracted).toBe(true);
    expect(checkGuardSubtracted).toBe(true);
    expect(checkStringSubtracted).toBe(true);
    expect(checkPredicateSubtracted).toBe(true);
    expect(checkMatchedOfTuple).toBe(true);
    expect(checkSubtractedOfTuple).toBe(true);
    expect(checkPredicateSubtractsNothing).toBe(true);
  });
});
