// shared types and utilities for both flavors

import { AbortError, isAbortError } from '@cancjs/toolbox';
import type { AbortSignalLike, DocChunk, RagApi } from '@shared/mock-api';
import { attachAbort } from '@shared/util';

export interface RagAnswer {
  query: string;
  text: string;
  sources: string[];
}

// deterministic query embedding for reproducible cache lookups
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

// retrieval legs hitting vector and keyword endpoints
export function vectorSearch(ragApi: RagApi, query: string, signal?: AbortSignalLike): Promise<DocChunk[]> {
  return ragApi.search(query, signal);
}

export function keywordSearch(ragApi: RagApi, query: string, signal?: AbortSignalLike): Promise<DocChunk[]> {
  return ragApi.search(query, signal);
}

/**
 * Yields each retrieval leg as it settles.
 * Early return from cancel aborts both legs via internal controller.
 */
export async function* retrieveLegs(
  ragApi: RagApi,
  query: string,
  signal?: AbortSignalLike,
): AsyncGenerator<DocChunk[], void, void> {
  const controller = new AbortController();
  const detach = attachAbort(signal, () => controller.abort());
  try {
    // absorb unawaited abort errors from abandoned pulls
    const legs = [vectorSearch(ragApi, query, controller.signal), keywordSearch(ragApi, query, controller.signal)].map(
      (leg) => leg.catch(ignoreAbort),
    );
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

// merge retrieval legs, deduplicating by chunk id
export function mergeHits(legs: DocChunk[][]): DocChunk[] {
  const byId = new Map<string, DocChunk>();
  for (const chunk of legs.flat()) byId.set(chunk.id, chunk);
  return [...byId.values()];
}
