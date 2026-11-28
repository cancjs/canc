import { features } from '@cancjs/node';
import type { Equal, Expect } from '../common/assert-type';
// @ts-expect-error unrelated flag removed
void features.hasSqlite;
type _Features = Expect<
  Equal<
    keyof typeof features,
    | 'nodeVersion'
    | 'nodeMajor'
    | 'hasGlob'
    | 'hasMkdtempDisposable'
    | 'hasStatfs'
    | 'hasAddAbortListener'
    | 'hasAsyncDispose'
    | 'hasConsumersBytes'
    | 'hasDuplexPair'
    | 'hasWorkerLocks'
  >
>;
