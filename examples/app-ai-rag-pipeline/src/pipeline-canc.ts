// The "ask the manual" pipeline, cancelable version. Same shape as pipeline-vanilla.ts, but built
// with cancAsync so one cancel() aborts the in-flight step and skips everything below it.
//
// Cancellation is ambient inside the coroutine: no per-step checks. createAbortSignal mints one
// canc-aware signal for the whole run, threaded into each mock call; the coroutine's finally aborts
// it on cancel, so the abort reaches the simulated network and shows up as an aborted marker in the
// call log.

import { CancelablePromise, createAbortSignal } from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { embed, mergeHits, retrieveLegs, RagAnswer } from './pipeline';
import { generate } from './mock/llm';
import { rerank } from './mock/rerank';
import type { RagApi, ChatApi } from '@shared/mock-api';

export function ragPipeline(ragApi: RagApi, chatApi: ChatApi, query: string): CancelablePromise<RagAnswer> {
 // One canc-aware signal for the whole run. Aborting it reads as a genuine cancellation, so a
 // spec-compliant client rejects the in-flight request with a CancelError.
 const cancelSignal = createAbortSignal();

 return cancAsync(function* () {
 let cost = 0;
 let done = false;
 try {
 // embed the query — canceled here, nothing below runs
 yield* cancAwait(embed(query, cancelSignal.signal));
 cost += 1;

 // parallel retrieve, collected as a finite set. The two legs are a bounded source, so
 // cancForAwait.toArray buffers them into an array for a clean merge, the finite-collect
 // counterpart of the token stream's cancForAwait below.
 const legResultsArr = yield* cancForAwait.toArray(retrieveLegs(ragApi, query, cancelSignal.signal));
 const hits = mergeHits(legResultsArr);
 cost += 2;

 // rerank the merged hits — canceled here, generate never starts
 const ranked = yield* cancAwait(rerank(query, hits, cancelSignal.signal));
 cost += 1;

 // generate the answer from the top chunks. cancForAwait consumes the token stream as it
 // arrives; a cancel stops the pull between tokens and cancels the stream at its source.
 const context = ranked.slice(0, 3).map((chunk) => chunk.text).join(' ');
 let text = '';
 yield* cancForAwait(generate(chatApi, context, cancelSignal.signal), (token) => {
 text += token;
 });

 done = true;
 return { query, text, sources: ranked.slice(0, 3).map((chunk) => chunk.id) } as RagAnswer;
 } finally {
 // Always runs (normal end or cancel). On cancel it aborts the outbound signal so the in-flight
 // step stops at the mock-api boundary, then logs the partial cost so a canceled run is still
 // accounted for.
 if (!done) cancelSignal.abort();
 console.log(`[pipeline] settled after ${cost} paid step(s)`);
 }
 })() as CancelablePromise<RagAnswer>;
}
