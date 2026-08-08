import { Assert, Eq } from '../../../tests-types/fixtures/common/assert-type';
import type { MatchedError, MatchedOf, SubtractedError, SubtractedOf } from './error-matchers';

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

// 1. MatchedError assertions for all 4 matcher kinds
type _checkCtorMatched = Assert<Eq<MatchedError<CtorMatcher>, FooError>>;
type _checkGuardMatched = Assert<Eq<MatchedError<GuardMatcher>, BarError>>;
type _checkStringMatched = Assert<Eq<MatchedError<StringMatcher>, Error & { name: 'RetryError' }>>;
type _checkPredicateMatched = Assert<Eq<MatchedError<PredicateMatcher>, Error>>;

// 2. SubtractedError assertions for all 4 matcher kinds
type _checkCtorSubtracted = Assert<Eq<SubtractedError<CtorMatcher>, FooError>>;
type _checkGuardSubtracted = Assert<Eq<SubtractedError<GuardMatcher>, BarError>>;
type _checkStringSubtracted = Assert<Eq<SubtractedError<StringMatcher>, Error & { name: 'RetryError' }>>;
type _checkPredicateSubtracted = Assert<Eq<SubtractedError<PredicateMatcher>, never>>;

// 3. MatchedOf and SubtractedOf tuple assertions
type _checkMatchedOfTuple = Assert<Eq<MatchedOf<[CtorMatcher, GuardMatcher]>, FooError | BarError>>;
type _checkSubtractedOfTuple = Assert<Eq<SubtractedOf<[CtorMatcher, GuardMatcher]>, FooError | BarError>>;

// 4. Load-bearing negative assertion: plain predicate subtracts NOTHING from failure set
type _checkPredicateSubtractsNothing = Assert<
  Eq<Exclude<FooError | BarError, SubtractedOf<[PredicateMatcher]>>, FooError | BarError>
>;

describe('matcher type mappings', () => {
  it('type assertion helpers pass compile-time checks', () => {
    expect(true).toBe(true);
  });
});
