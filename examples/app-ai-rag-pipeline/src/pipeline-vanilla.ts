// The "ask the manual" pipeline, plain uncancelable version. Reads top to bottom: embed the query,
// retrieve in parallel, rerank, generate the answer. There is no way to stop it once it starts.
//
// Nothing here takes a signal, so a user who navigates away still pays for every step below the
// point they left. The mirrored comments in pipeline-canc.ts show where each of those steps stops.

import type { ChatApi, DocChunk, RagApi } from '@shared/mock-api';

import { generate } from './mock/llm';
import { rerank } from './mock/rerank';
import { embed, mergeHits, RagAnswer, retrieveLegs } from './pipeline';

export async function ragPipeline(ragApi: RagApi, chatApi: ChatApi, query: string): Promise<RagAnswer> {
  // embed the query
  await embed(query);

  // parallel retrieve, collected as a finite set. Drain the bounded leg source into an array, the
  // same shape the canc flavor buffers with cancForAwait.toArray.
  const legs: DocChunk[][] = [];
  for await (const leg of retrieveLegs(ragApi, query)) {
    legs.push(leg);
  }
  const hits = mergeHits(legs);

  // rerank the merged hits
  const ranked = await rerank(query, hits);

  // generate the answer from the top chunks — runs to the end even if nobody is listening anymore
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
