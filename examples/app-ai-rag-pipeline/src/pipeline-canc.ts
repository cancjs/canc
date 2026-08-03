// The "ask the manual" pipeline, cancelable version. Same shape as pipeline-vanilla.ts, but built
// with canc.async so one cancel() aborts the in-flight step and skips everything below it.
//
// Cancellation is ambient inside the coroutine: no per-step checks, no signal in sight. Each mock
// call is cancelified once at the boundary below, so the coroutine body reads like plain
// async/await and a cancel reaches the simulated network as an aborted marker in the call log.

import * as canc from '@cancjs/coroutine';
import { cancelify } from '@cancjs/toolbox';
import type { ChatApi, DocChunk, RagApi } from '@shared/mock-api';

import { generate } from './mock/llm';
import type { RankedChunk } from './mock/rerank';
import { rerank } from './mock/rerank';
import { embed, mergeHits, retrieveLegs } from './pipeline';

// Cancelified once: the coroutine calls these with no signal argument, and canceling the returned
// promise aborts the signal the mock API sees.
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
      // embed the query — canceled here, nothing below runs
      const embedding = embedQuery(query);
      yield* canc.await(embedding);
      cost += 1;

      // parallel retrieve, collected as a finite set. The two legs are a bounded source, so
      // canc.forAwait.toArray buffers them into an array for a clean merge, the finite-collect
      // counterpart of the token stream's canc.forAwait below.
      const legsSource = yield* canc.await(retrieveLegsSource(ragApi, query));
      const legResultsArr = yield* canc.forAwait.toArray(legsSource);
      const hits = mergeHits(legResultsArr);
      cost += 2;

      // rerank the merged hits — canceled here, generate never starts
      const ranked: RankedChunk[] = yield* canc.await(rerankHits(query, hits));
      cost += 1;

      // generate the answer from the top chunks. canc.forAwait consumes the token stream as it
      // arrives; a cancel stops the pull between tokens and cancels the stream at its source.
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
      // Real cleanup, not abort bookkeeping: reports the partial cost either way. reportCost is
      // demo instrumentation, kept separate from the business logic above.
      const reportCost = cost;
      console.log(`[pipeline] settled after ${reportCost} paid step(s), canceled=${!done}`);
    }
  })();
}
