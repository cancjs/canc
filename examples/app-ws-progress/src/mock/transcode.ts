// fake transcoder to prove cancel() stopped work

import { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';
import { AbortSignalLike, MockApi } from '@shared/mock-api';

export interface TranscodeChunk {
  index: number;
  total: number;
}

/** The fake encoder backend a transcoder is built from. Named for its role so the server never
 * has to name the whole MockApi bundle. */
export type ExportBackend = MockApi;

/** A canc-native transcoder: `transcode(chunk)` returns a CancelablePromise; canceling it aborts
 * the chunk in flight. Built once from the signal-aware backend so the job stays signal-free. */
export type Transcoder = (chunk: TranscodeChunk) => CancelablePromise<TranscodeChunk>;

// cancelify signal-aware backend at its boundary so job stays signal-free
export function createTranscoder(backend: ExportBackend): Transcoder {
  return cancelify(({ getSignal }, chunk: TranscodeChunk) => transcodeChunk(backend, chunk, getSignal()));
}

/**
 * Transcode one chunk. Resolves after a per-chunk latency, or rejects with an AbortError the
 * instant `signal` fires. The MockApi records started/completed/aborted for the chunk so a test
 * can count exactly how many chunks ran.
 */
export function transcodeChunk(api: MockApi, chunk: TranscodeChunk, signal?: AbortSignalLike): Promise<TranscodeChunk> {
  return api.respond('transcode.chunk', chunk, () => chunk, signal);
}

export const TOTAL_CHUNKS = 100;
