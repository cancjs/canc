// Shared types and the tiny embed step used by both flavors. The vanilla and canc pipelines differ
// only in how they thread cancellation, so everything that is not cancellation lives here.

import type { AbortSignalLike, DocChunk, RagApi } from '@shared/mock-api';
import { AbortError, isAbortError } from '@cancjs/toolbox';
import { attachAbort } from '@shared/util';

export interface RagAnswer {
 query: string;
 text: string;
 sources: string[];
}

// A deterministic query embedding. Same query text always yields the same vector, so cache lookups
// and runs are reproducible. This mirrors the mock-api's own document embeddings.
const EMBED_LATENCY = 5;

export function embed(query: string, signal?: AbortSignalLike): Promise<number[]> {
 return new Promise<number[]>((resolve, reject) => {
 if (signal?.aborted) {
 reject(new AbortError());
 return;
 }
 const timer = setTimeout(() => {
 signal?.removeEventListener?.('abort', onAbort);
 const dims = [0, 0, 0, 0];
 for (let i = 0; i < query.length; i++) dims[i % 4] += query.charCodeAt(i);
 const norm = Math.sqrt(dims.reduce((sum, d) => sum + d * d, 0)) || 1;
 resolve(dims.map((d) => Number((d / norm).toFixed(6))));
 }, EMBED_LATENCY);

 const onAbort = () => {
 clearTimeout(timer);
 reject(new AbortError());
 };
 signal?.addEventListener?.('abort', onAbort);
 });
}

// Two retrieval legs: a vector search over embeddings and a plain keyword search. Both are needed,
// so there is no loser to cancel here. They both hit the mock rag endpoint; in a real system one
// would query a vector DB and the other a text index.
export function vectorSearch(ragApi: RagApi, query: string, signal?: AbortSignalLike): Promise<DocChunk[]> {
 return ragApi.search(query, signal);
}

export function keywordSearch(ragApi: RagApi, query: string, signal?: AbortSignalLike): Promise<DocChunk[]> {
 return ragApi.search(query, signal);
}

// The retrieval legs as a bounded async source: both legs start at once, then the generator yields
// each result as it settles, and completes. Both flavors drain it to a finite array, the canc flavor
// with cancForAwait.toArray, the vanilla flavor with a for-await loop. This is the "collect a finite set"
// shape, the mirror of the token stream's "consume as it arrives" shape below. Starting both legs up
// front keeps both requests in flight, so a cancel aborts them together at the mock-api boundary.
//
// The generator owns its own AbortController and mirrors any incoming signal into it, so an early
// `.return()` (a consumer stopping the pull, e.g. a canceled coroutine) aborts both legs even though
// the caller's own signal has already settled by then. The vanilla flavor never returns early, so this
// finally is a harmless no-op there.
export async function* retrieveLegs(
 ragApi: RagApi,
 query: string,
 signal?: AbortSignalLike,
): AsyncGenerator<DocChunk[], void, void> {
 const controller = new AbortController();
 const detach = attachAbort(signal, () => controller.abort());
 try {
 // A cancel abandons this generator between pulls, so a leg still in flight rejects with an
 // AbortError that nobody is awaiting. Absorb that abort here: the pipeline already accounts for
 // the cancel, so an unconsumed leg's abort is expected, not a failure to surface.
 const legs = [
 vectorSearch(ragApi, query, controller.signal),
 keywordSearch(ragApi, query, controller.signal),
 ].map((leg) => leg.catch(ignoreAbort));
 for (const leg of legs) {
 const hits = await leg;
 if (hits) yield hits;
 }
 } finally {
 detach?.();
 controller.abort();
 }
}

function ignoreAbort(error: unknown): DocChunk[] | undefined {
 if (isAbortError(error)) return undefined;
 throw error;
}

// Merge the retrieval legs, de-duplicating by chunk id.
export function mergeHits(legs: DocChunk[][]): DocChunk[] {
 const byId = new Map<string, DocChunk>();
 for (const chunk of legs.flat()) byId.set(chunk.id, chunk);
 return [...byId.values()];
}
