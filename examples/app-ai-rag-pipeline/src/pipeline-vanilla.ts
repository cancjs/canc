// uncancelable rag pipeline with no way to stop steps once started

import type { ChatApi, DocChunk, RagApi } from '@shared/mock-api';

import { generate } from './mock/llm';
import { rerank } from './mock/rerank';
import { embed, mergeHits, RagAnswer, retrieveLegs } from './pipeline';

export async function ragPipeline(ragApi: RagApi, chatApi: ChatApi, query: string): Promise<RagAnswer> {
  // embed the query: keeps running if user leaves
  await embed(query);

  // parallel retrieve buffered into array for merge
  const legs: DocChunk[][] = [];
  for await (const leg of retrieveLegs(ragApi, query)) {
    legs.push(leg);
  }
  const hits = mergeHits(legs);

  // rerank merged hits: runs to completion regardless
  const ranked = await rerank(query, hits);

  // generate answer from top chunks: runs to end even if abandoned
  const context = ranked
    .slice(0, 3)
    .map((chunk) => chunk.text)
    .join(' ');
  let text = '';
  for await (const token of generate(chatApi, context)) {
    text += token;
  }

  return { query, text, sources: ranked.slice(0, 3).map((chunk) => chunk.id) };
}
