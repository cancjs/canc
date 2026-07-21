// The "ask the manual" pipeline, cancelable version. Same shape as pipeline-vanilla.ts, but built
// with cancAsync so one cancel() aborts the in-flight step and skips everything below it.
//
// Cancellation is ambient inside the coroutine: no per-step checks, no signal in sight. Each mock
// call is cancelified once at the boundary below, so the coroutine body reads like plain
// async/await and a cancel reaches the simulated network as an aborted marker in the call log.

import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancelify } from '@cancjs/toolbox';
import { embed, mergeHits, retrieveLegs } from './pipeline';
import { generate } from './mock/llm';
import { rerank } from './mock/rerank';
import type { RagApi, ChatApi, DocChunk } from '@shared/mock-api';
import type { RankedChunk } from './mock/rerank';

// Cancelified once: the coroutine calls these with no signal argument, and canceling the returned
// promise aborts the signal the mock API sees.
const embedQuery = cancelify(({ getSignal }, [query]: [string]) => embed(query, getSignal()));
const retrieveLegsSource = cancelify(({ getSignal }, [ragApi, query]: [RagApi, string]) =>
 Promise.resolve(retrieveLegs(ragApi, query, getSignal())),
);
const rerankHits = cancelify(({ getSignal }, [query, hits]: [string, DocChunk[]]) => rerank(query, hits, getSignal()));
const generateAnswer = cancelify(({ getSignal }, [chatApi, prompt]: [ChatApi, string]) =>
 Promise.resolve(generate(chatApi, prompt, getSignal())),
);

export function ragPipeline(ragApi: RagApi, chatApi: ChatApi, query: string) {
 return cancAsync(function* () {
 let cost = 0;
 let done = false;
 try {
 // embed the query — canceled here, nothing below runs
 const embedding = embedQuery(query);
 yield* cancAwait(embedding);
 cost += 1;

 // parallel retrieve, collected as a finite set. The two legs are a bounded source, so
 // cancForAwait.toArray buffers them into an array for a clean merge, the finite-collect
 // counterpart of the token stream's cancForAwait below.
 const legsSource = yield* cancAwait(retrieveLegsSource(ragApi, query));
 const legResultsArr = yield* cancForAwait.toArray(legsSource);
 const hits = mergeHits(legResultsArr);
 cost += 2;

 // rerank the merged hits — canceled here, generate never starts
 const ranked: RankedChunk[] = yield* cancAwait(rerankHits(query, hits));
 cost += 1;

 // generate the answer from the top chunks. cancForAwait consumes the token stream as it
 // arrives; a cancel stops the pull between tokens and cancels the stream at its source.
 const context = ranked.slice(0, 3).map((chunk) => chunk.text).join(' ');
 let text = '';
 const tokenStream = yield* cancAwait(generateAnswer(chatApi, context));
 yield* cancForAwait(tokenStream, (token: string) => {
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
