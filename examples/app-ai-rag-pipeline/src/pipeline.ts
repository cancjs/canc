// Shared types and the tiny embed step used by both flavors. The vanilla and canc pipelines differ
// only in how they thread cancellation, so everything that is not cancellation lives here.

import type { AbortSignalLike, DocChunk, MockApiBundle } from '@shared/mock-api';
import { AbortError } from '@shared/mock-api';

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

// Two retrieval legs run in parallel: a vector search over embeddings and a plain keyword search.
// Both are needed (loser semantics do not apply — this is `all`, not `race`). They both come from
// the mock rag endpoint here; in a real system one would hit a vector DB and the other a text index.
export function vectorSearch(mockApi: MockApiBundle, query: string, signal?: AbortSignalLike): Promise<DocChunk[]> {
 return mockApi.rag.search(query, signal);
}

export function keywordSearch(mockApi: MockApiBundle, query: string, signal?: AbortSignalLike): Promise<DocChunk[]> {
 return mockApi.rag.search(query, signal);
}

// Merge the two retrieval legs, de-duplicating by chunk id.
export function mergeHits(vector: DocChunk[], keyword: DocChunk[]): DocChunk[] {
 const byId = new Map<string, DocChunk>();
 for (const chunk of [...vector, ...keyword]) byId.set(chunk.id, chunk);
 return [...byId.values()];
}
