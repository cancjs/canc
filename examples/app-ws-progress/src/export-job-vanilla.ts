// async generator yielding progress while transcoding chunk by chunk without cancellation

import { MockApi } from '@shared/mock-api';

import { TOTAL_CHUNKS, transcodeChunk } from './mock/transcode';

export interface ExportJobDeps {
  api: MockApi;
}

export async function* exportJob(deps: ExportJobDeps): AsyncGenerator<number, void, unknown> {
  const { api } = deps;
  try {
    for (let index = 1; index <= TOTAL_CHUNKS; index++) {
      // internal await: transcode one chunk
      await transcodeChunk(api, { index, total: TOTAL_CHUNKS });
      // emit progress to consumer
      const percent = Math.round((index / TOTAL_CHUNKS) * 100);
      yield percent;
    }
  } finally {
    // runs on completion or when client abandons (wasted work continues)
  }
}
