// The export job: a cancelable async generator that yields progress percentages while it
// transcodes the video chunk by chunk. This is the teaching payload.
//
// `cancIterAsync` turns a plain generator into a cancelable async iterator. Inside it:
// - `yield* cancIterAwait(x)` suspends on `x` without emitting it (an internal await),
// - `yield x` emits `x` to the `for await` consumer.
// Canceling the iterator (its `.next()` promise, or a `.return()` / break) runs the generator's
// `finally` and stops it. We thread the job's AbortSignal into each transcode call, so a cancel
// aborts the chunk that is in flight and every later chunk simply never starts.

import { cancIterAsync, cancIterAwait, AsyncIterResult } from '@cancjs/coroutine';
import { MockApi } from '@shared/mock-api';
import { transcodeChunk, TOTAL_CHUNKS } from './mock/transcode';

export interface ExportJobDeps {
 api: MockApi;
 signal: AbortSignal;
}

export const exportJob = cancIterAsync(function* (deps: ExportJobDeps): AsyncIterResult<number, void> {
 const { api, signal } = deps;
 try {
 for (let index = 1; index <= TOTAL_CHUNKS; index++) {
 // Internal await: transcode one chunk. The signal aborts it the moment the job is canceled.
 yield* cancIterAwait(transcodeChunk(api, { index, total: TOTAL_CHUNKS }, signal));
 // Emit progress to the consumer. Canceled here -> nothing below runs, no further chunk starts.
 yield Math.round((index / TOTAL_CHUNKS) * 100);
 }
 } finally {
 // Runs on normal completion AND on cancel: the place to release a real encoder handle.
 }
});
