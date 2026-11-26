import type { FailureOf, MatchedError, SubtractedError, TErrorMatcher } from '@cancjs/promise';
import {
  CancelablePromise as CP,
  catchErrors,
  createCatchError,
  createIsError,
  createSuppressError,
  suppressErrors,
  withFailure,
} from '@cancjs/promise';

import type { Assert, Eq } from './assert-type';

class Missing extends Error {
  readonly missing = true;
}
class Forbidden extends Error {
  readonly forbidden = true;
}
declare const work: CP<number, Missing | Forbidden>;
declare const broad: readonly TErrorMatcher[];
const predicate = (e: unknown): boolean => e instanceof Missing && e.message === 'partial';
const guard = (e: unknown): e is Missing => e instanceof Missing;
const partial = createIsError(predicate);
const mixed = createIsError(Missing, predicate);
const mixedGuard = createIsError(guard, predicate);
const unknownMatchers = createIsError(...broad);
const complete = createIsError(Missing, guard, 'OtherError');

type _partial = Assert<Eq<SubtractedError<typeof partial>, never>>;
type _mixed = Assert<Eq<SubtractedError<typeof mixed>, never>>;
type _mixedGuard = Assert<Eq<SubtractedError<typeof mixedGuard>, never>>;
type _broad = Assert<Eq<SubtractedError<typeof unknownMatchers>, never>>;
type _complete = Assert<Eq<SubtractedError<typeof complete>, Missing | (Error & { name: 'OtherError' })>>;
type _matchedPartial = Assert<Eq<MatchedError<typeof partial>, Error>>;

const partialCaught = catchErrors(work, partial);
type _partialCaught = Assert<Eq<typeof partialCaught, CP<number | Error, Missing | Forbidden>>>;
const partialSuppressed = suppressErrors(work, partial);
type _partialSuppressed = Assert<Eq<typeof partialSuppressed, CP<number | void, Missing | Forbidden>>>;
const mixedCaught = createCatchError(mixed)(work);
type _mixedCaught = Assert<Eq<FailureOf<typeof mixedCaught>, Missing | Forbidden>>;
const mixedSuppressed = createSuppressError(mixedGuard)(work);
type _mixedSuppressed = Assert<Eq<FailureOf<typeof mixedSuppressed>, Missing | Forbidden>>;
const broadSuppressed = suppressErrors(work, unknownMatchers);
type _broadSuppressed = Assert<Eq<FailureOf<typeof broadSuppressed>, Missing | Forbidden>>;
const directSuppressed = suppressErrors(work, predicate);
type _direct = Assert<Eq<FailureOf<typeof directSuppressed>, Missing | Forbidden>>;
const completeSuppressed = suppressErrors(work, complete);
type _completeSuppressed = Assert<Eq<FailureOf<typeof completeSuppressed>, Forbidden>>;
const declaredPartial = withFailure(partial)(work);
type _declaredPartial = Assert<Eq<FailureOf<typeof declaredPartial>, Error>>;
const declaredComplete = withFailure(createIsError(Missing))(work);
type _declaredComplete = Assert<Eq<FailureOf<typeof declaredComplete>, Missing>>;
