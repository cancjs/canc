// Cache-vs-pipeline race, cancelable version. Same shape as cache-race-vanilla.ts, but the race is a
// CancelablePromise.race, so the loser is canceled, not left running.
//
// When the cache wins, race() cancels the full pipeline. Cancellation flows down the whole tree: the
// in-flight retrieve calls abort (aborted markers appear in mockApi.calls) and no rerank or generate
// call is ever made. This is the loser-cancel doing real work on a live tree.

import { CancelablePromise } from '@cancjs/promise';
import { ragPipeline } from './pipeline-canc';
import { RagAnswer } from './pipeline';
import type { MockApiBundle } from '@shared/mock-api';

export function answerWithCache(mockApi: MockApiBundle, query: string): CancelablePromise<RagAnswer> {
 return CancelablePromise.race([
 lookupCache(mockApi, query),
 ragPipeline(mockApi, query),
 ]);
}

// A fast semantic-cache lookup. Resolves quickly when there is a cached answer for the query.
function lookupCache(mockApi: MockApiBundle, query: string): CancelablePromise<RagAnswer> {
 return new CancelablePromise((resolve) => {
 setTimeout(() => {
 resolve({ query, text: `cached: ${query}`, sources: ['cache'] });
 }, 20);
 });
}
