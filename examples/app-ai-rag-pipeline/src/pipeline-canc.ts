// The "ask the manual" pipeline, cancelable version. Same shape as pipeline-vanilla.ts, but built
// with cancAsync so one cancel() aborts the in-flight step and skips everything below it.
//
// Cancellation is ambient inside the coroutine: no per-step checks. A signal derived from the
// pipeline's own cancellation is threaded into each mock call, so the abort reaches the simulated
// network and shows up as an aborted marker in mockApi.calls.

import { CancelablePromise } from '@cancjs/promise';
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import { embed, keywordSearch, mergeHits, vectorSearch, RagAnswer } from './pipeline';
import { generate } from './mock/llm';
import { rerank } from './mock/rerank';
import type { MockApiBundle } from '@shared/mock-api';

export function ragPipeline(mockApi: MockApiBundle, query: string): CancelablePromise<RagAnswer> {
 // Wire the pipeline's cancellation to a native signal the steps can use. handleCancel fires when
 // this promise is canceled, whether by an explicit cancel() or by losing a race(). It aborts the
 // controller, so one cancel aborts the in-flight step at the mock-api boundary and skips the rest.
 return new CancelablePromise<RagAnswer>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 (runPipeline(mockApi, query, controller.signal) as Promise<RagAnswer>).then(resolve, reject);
 handleCancel(() => controller.abort());
 });
}

const runPipeline = cancAsync(function* (mockApi: MockApiBundle, query: string, signal: AbortSignal): any {
 let cost = 0;
 try {
 // embed the query — canceled here, nothing below runs
 yield* cancAwait(embed(query, signal));
 cost += 1;

 // parallel retrieve — both legs needed, so this is `all`, not a race
 const [vector, keyword] = yield* cancAwait.all([
 vectorSearch(mockApi, query, signal),
 keywordSearch(mockApi, query, signal),
 ]);
 const hits = mergeHits(vector, keyword);
 cost += 2;

 // rerank the merged hits — canceled here, generate never starts
 const ranked = yield* cancAwait(rerank(query, hits, signal));
 cost += 1;

 // generate the answer from the top chunks — an abort mid-stream stops emitting tokens
 const context = ranked.slice(0, 3).map((chunk: { text: string }) => chunk.text).join(' ');
 const stream = generate(mockApi, context, signal);
 let text = '';
 while (true) {
 const next: IteratorResult<string, void> = yield* cancAwait(stream.next());
 if (next.done) break;
 text += next.value;
 }

 return { query, text, sources: ranked.slice(0, 3).map((chunk: { id: string }) => chunk.id) } as RagAnswer;
 } finally {
 // Shielded on cancel: log the partial cost so a canceled request is still accounted for.
 console.log(`[pipeline] settled after ${cost} paid step(s)`);
 }
});
