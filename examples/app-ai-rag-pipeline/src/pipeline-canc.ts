// cancelable rag pipeline built with canc.async so cancel aborts active step

import * as canc from '@cancjs/coroutine';
import { cancelify } from '@cancjs/toolbox';
import type { ChatApi, DocChunk, RagApi } from '@shared/mock-api';

import { generate } from './mock/llm';
import type { RankedChunk } from './mock/rerank';
import { rerank } from './mock/rerank';
import { embed, mergeHits, retrieveLegs } from './pipeline';

// cancelified boundary: canceling returned promise aborts signal in mock API
const embedQuery = cancelify(({ getSignal }, query: string) => embed(query, getSignal()));
const retrieveLegsSource = cancelify(({ getSignal }, ragApi: RagApi, query: string) =>
  Promise.resolve(retrieveLegs(ragApi, query, getSignal())),
);
const rerankHits = cancelify(({ getSignal }, query: string, hits: DocChunk[]) => rerank(query, hits, getSignal()));
const generateAnswer = cancelify(({ getSignal }, chatApi: ChatApi, prompt: string) =>
  Promise.resolve(generate(chatApi, prompt, getSignal())),
);

export function ragPipeline(ragApi: RagApi, chatApi: ChatApi, query: string) {
  return canc.async(function* () {
    let cost = 0;
    let done = false;
    try {
      // embed the query: if canceled here, nothing below runs
      const embedding = embedQuery(query);
      yield* canc.await(embedding);
      cost += 1;

      // parallel retrieve buffered into array for merge
      const legsSource = yield* canc.await(retrieveLegsSource(ragApi, query));
      const legResultsArr = yield* canc.forAwait.toArray(legsSource);
      const hits = mergeHits(legResultsArr);
      cost += 2;

      // rerank merged hits: if canceled here, generate never starts
      const ranked: RankedChunk[] = yield* canc.await(rerankHits(query, hits));
      cost += 1;

      // generate answer from top chunks: cancel stops stream pull at source
      const context = ranked
        .slice(0, 3)
        .map((chunk) => chunk.text)
        .join(' ');
      let text = '';
      const tokenStream = yield* canc.await(generateAnswer(chatApi, context));
      yield* canc.forAwait(tokenStream, (token: string) => {
        text += token;
      });

      done = true;
      return { query, text, sources: ranked.slice(0, 3).map((chunk) => chunk.id) };
    } finally {
      // reporting partial cost on settle (demo instrumentation)
      const reportCost = cost;
      console.log(`[pipeline] settled after ${reportCost} paid step(s), canceled=${!done}`);
    }
  })();
}
