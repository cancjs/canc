// Cache-vs-pipeline race, plain uncancelable version. A fast cache lookup runs against the full
// pipeline. Whichever settles first is the answer.
//
// Promise.race resolves with the winner, but the loser keeps running. When the cache wins, the whole
// pipeline below it still embeds, retrieves, reranks, and generates — the user already got the cached
// answer, yet this work still runs and bills. The mirrored comment in cache-race-canc.ts shows the
// pipeline being canceled at that same point.

import { ragPipeline } from './pipeline-vanilla';
import { RagAnswer } from './pipeline';
import type { MockApiBundle } from '@shared/mock-api';

export function answerWithCache(mockApi: MockApiBundle, query: string): Promise<RagAnswer> {
 return Promise.race([
 lookupCache(mockApi, query),
 ragPipeline(mockApi, query),
 ]);
}

// A fast semantic-cache lookup. Resolves quickly when there is a cached answer for the query.
function lookupCache(mockApi: MockApiBundle, query: string): Promise<RagAnswer> {
 return new Promise((resolve) => {
 setTimeout(() => {
 resolve({ query, text: `cached: ${query}`, sources: ['cache'] });
 }, 20);
 });
}
