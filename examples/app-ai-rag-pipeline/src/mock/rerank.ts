// Aux: pretend this is a cross-encoder rerank service. It scores each hit against the query and
// returns them best-first. The scoring is a trivial term-overlap count, but the point is only that
// it is one more signal-aware network step in the pipeline, abortable like the rest.

import type { AbortSignalLike, DocChunk } from '@shared/mock-api';
import { AbortError } from '@shared/mock-api';

export interface RankedChunk extends DocChunk {
 score: number;
}

// Simulated latency for the rerank leg, kept separate from the mock-api latency so the pipeline has
// a distinct, independently abortable step here.
const RERANK_LATENCY = 40;

function overlap(query: string, text: string): number {
 const terms = new Set(query.toLowerCase().split(/\s+/).filter(Boolean));
 let score = 0;
 for (const word of text.toLowerCase().split(/\s+/)) {
 if (terms.has(word)) score += 1;
 }
 return score;
}

/**
 * Reranks retrieved chunks against the query, best-first. Rejects with an AbortError the moment the
 * signal fires, so a cancel that lands during rerank stops it and nothing downstream runs.
 */
export function rerank(query: string, hits: DocChunk[], signal?: AbortSignalLike): Promise<RankedChunk[]> {
 return new Promise<RankedChunk[]>((resolve, reject) => {
 if (signal?.aborted) {
 reject(new AbortError());
 return;
 }
 const timer = setTimeout(() => {
 signal?.removeEventListener?.('abort', onAbort);
 const ranked = hits
 .map((chunk) => ({ ...chunk, score: overlap(query, chunk.text) }))
 .sort((a, b) => b.score - a.score);
 resolve(ranked);
 }, RERANK_LATENCY);

 const onAbort = () => {
 clearTimeout(timer);
 reject(new AbortError());
 };
 signal?.addEventListener?.('abort', onAbort);
 });
}
