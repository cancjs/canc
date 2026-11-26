import type { MatchedError, SubtractedError, TReason } from '@cancjs/promise';
// @ts-expect-error the tuple shorthand is no longer exported
import type { MatchedOf } from '@cancjs/promise';
// @ts-expect-error the tuple shorthand is no longer exported
import type { SubtractedOf } from '@cancjs/promise';

import type { Assert, Eq } from './assert-type';

class MatchError extends Error {
  readonly matched = true;
}

type Matchers = readonly [typeof MatchError, 'OtherError'];
type Expected = MatchError | (Error & { name: 'OtherError' });
type _matched = Assert<Eq<MatchedError<Matchers[number]>, Expected>>;
type _subtracted = Assert<Eq<SubtractedError<Matchers[number]>, Expected>>;
type _reason = Assert<Eq<TReason<MatchError>, MatchError>>;
