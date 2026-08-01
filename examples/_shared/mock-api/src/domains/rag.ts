import { AbortSignalLike, MockApi } from '../core';

export interface DocChunk {
  id: string;
  text: string;
  embedding: number[];
}

const DOCS: Array<{ id: string; text: string }> = [
  { id: 'd1', text: 'Cancellation is a special rejection.' },
  { id: 'd2', text: 'Bubble propagates cancel upward.' },
  { id: 'd3', text: 'Shield protects cleanup from cancel.' },
];

// Deterministic fake embedding: 4 dims derived from character codes. Same text -> same vector.
function fakeEmbedding(text: string): number[] {
  const dims = [0, 0, 0, 0];
  for (let i = 0; i < text.length; i++) {
    dims[i % 4] += text.charCodeAt(i);
  }
  const norm = Math.sqrt(dims.reduce((sum, d) => sum + d * d, 0)) || 1;
  return dims.map((d) => Number((d / norm).toFixed(6)));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
}

export interface RagApi {
  search(query: string, signal?: AbortSignalLike): Promise<DocChunk[]>;
}

export function createRagApi(api: MockApi): RagApi {
  return {
    search: (query, signal) =>
      api.respond(
        'rag.search',
        { query },
        () => {
          const queryVec = fakeEmbedding(query);
          return DOCS.map((d) => ({ id: d.id, text: d.text, embedding: fakeEmbedding(d.text) }))
            .map((chunk) => ({ chunk, score: dot(chunk.embedding, queryVec) }))
            .sort((a, b) => b.score - a.score)
            .map((ranked) => ranked.chunk);
        },
        signal,
      ),
  };
}
