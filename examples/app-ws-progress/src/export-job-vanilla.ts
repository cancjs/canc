// The export job: a plain async generator that yields progress percentages while it transcodes
// the video chunk by chunk. This is the teaching payload.
//
// A native async generator yields to the consumer with `yield` and awaits internally with
// `await`. There is no cancellation counterpart: once the consumer stops reading, the running
// `await transcodeChunk(...)` still finishes, and because nothing carries a cancel signal, the
// loop keeps starting the next chunk too. Stopping the SENDER does not stop the WORK.

import { MockApi } from '@shared/mock-api';

import { TOTAL_CHUNKS, transcodeChunk } from './mock/transcode';

export interface ExportJobDeps {
  api: MockApi;
}

export async function* exportJob(deps: ExportJobDeps): AsyncGenerator<number, void, unknown> {
  const { api } = deps;
  try {
    for (let index = 1; index <= TOTAL_CHUNKS; index++) {
      // Internal await: transcode one chunk. No signal to pass, so this always runs to completion.
      await transcodeChunk(api, { index, total: TOTAL_CHUNKS });
      // Emit progress to the consumer. (no cancellation counterpart - see -canc)
      yield Math.round((index / TOTAL_CHUNKS) * 100);
    }
  } finally {
    // Runs when the loop ends normally. On an abandoned client it still runs LATE, after every
    // remaining chunk transcoded (wasted work).
  }
}
