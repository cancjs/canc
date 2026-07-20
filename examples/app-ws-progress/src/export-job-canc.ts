// The export job: a cancelable async generator that yields progress percentages while it
// transcodes the video chunk by chunk. This is the teaching payload.
//
// The underlying transcoder is signal-aware, so it is cancelified ONCE at its boundary into a
// canc-native `transcode(chunk)`. The job never sees a signal or an AbortController: it just calls
// `transcode` and lets its own cancellation abort whatever chunk is in flight.
//
// `cancGenAsync` turns a plain generator into a cancelable async generator. Inside it:
// - `yield* cancGenAwait(x)` suspends on `x` without emitting it (an internal await),
// - `yield x` emits `x` to the `for await` consumer.
// Canceling the generator (its `.next()` promise, or a `.return()` / break) runs the generator's
// `finally` and stops it. Because `transcode` is cancelable, canceling the job aborts the chunk in
// flight and every later chunk simply never starts.

import { cancGenAsync, cancGenAwait, AsyncGenResult } from '@cancjs/coroutine/gen';
import { Transcoder, TOTAL_CHUNKS } from './mock/transcode';

export const exportJob = cancGenAsync(function* (transcode: Transcoder): AsyncGenResult<number, void> {
 try {
 for (let index = 1; index <= TOTAL_CHUNKS; index++) {
 // Internal await: transcode one chunk. Canceling the job aborts it the moment it fires.
 yield* cancGenAwait(transcode({ index, total: TOTAL_CHUNKS }));
 // Emit progress to the consumer. Canceled here -> nothing below runs, no further chunk starts.
 yield Math.round((index / TOTAL_CHUNKS) * 100);
 }
 } finally {
 // Runs on normal completion AND on cancel: the place to release a real encoder handle.
 }
});
