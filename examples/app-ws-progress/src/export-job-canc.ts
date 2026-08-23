// cancelable async generator yielding progress while transcoding chunk by chunk

import { AsyncGenResult, cancGenAsync, cancGenAwait } from '@cancjs/coroutine/gen';

import { TOTAL_CHUNKS, Transcoder } from './mock/transcode';

export const exportJob = cancGenAsync(function* (transcode: Transcoder): AsyncGenResult<number, void> {
  try {
    for (let index = 1; index <= TOTAL_CHUNKS; index++) {
      // internal await: transcode one chunk
      yield* cancGenAwait(transcode({ index, total: TOTAL_CHUNKS }));
      // emit progress to consumer
      yield Math.round((index / TOTAL_CHUNKS) * 100);
    }
  } finally {
    // runs on completion and cancel to release encoder resources
  }
});
