// The "ask the manual" pipeline, plain uncancelable version. Reads top to bottom: embed the query,
// retrieve in parallel, rerank, generate the answer. There is no way to stop it once it starts.
//
// Nothing here takes a signal, so a user who navigates away still pays for every step below the
// point they left. The mirrored comments in pipeline-canc.ts show where each of those steps stops.

import { embed, keywordSearch, mergeHits, vectorSearch, RagAnswer } from './pipeline';
import { generate } from './mock/llm';
import { rerank } from './mock/rerank';
import type { MockApiBundle } from '@shared/mock-api';

export function ragPipeline(mockApi: MockApiBundle, query: string): Promise<RagAnswer> {
 return runPipeline(mockApi, query);
}

async function runPipeline(mockApi: MockApiBundle, query: string): Promise<RagAnswer> {
 // embed the query
 await embed(query);

 // parallel retrieve — both legs needed, so this is `all`, not a race
 const [vector, keyword] = await Promise.all([
 vectorSearch(mockApi, query),
 keywordSearch(mockApi, query),
 ]);
 const hits = mergeHits(vector, keyword);

 // rerank the merged hits
 const ranked = await rerank(query, hits);

 // generate the answer from the top chunks — runs to the end even if nobody is listening anymore
 const context = ranked.slice(0, 3).map((chunk) => chunk.text).join(' ');
 let text = '';
 for await (const token of generate(mockApi, context)) {
 text += token;
 }

 return { query, text, sources: ranked.slice(0, 3).map((chunk) => chunk.id) };
}
