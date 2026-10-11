import { ISettledFulfilled, ISettledRejected, ISettledResult } from '@cancjs/promise';

import { Eq } from '../../../tests-types/fixtures/common/assert-type';
import {
  ISettledFulfilled as SharedFulfilled,
  ISettledRejected as SharedRejected,
  ISettledResult as SharedResult,
} from '../../_toolbox/settled-result';

// toolbox-native cannot import promise, so only these checks tie the shared copy to it
describe('shared settled result type', () => {
  it('matches the promise package type member by member', () => {
    const fulfilledMatches: Eq<SharedFulfilled<string>, ISettledFulfilled<string>> = true;
    const rejectedMatches: Eq<SharedRejected, ISettledRejected> = true;
    const unionMatches: Eq<SharedResult<string>, ISettledResult<string>> = true;

    expect([fulfilledMatches, rejectedMatches, unionMatches]).toEqual([true, true, true]);
  });
});
