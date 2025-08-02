// Mock code: a fake transcoder. Pretend this is ffmpeg processing one chunk of a video export.
// It is scaffolding, not a copy target. It exists so the example can prove a cancel() actually
// stopped the work: every chunk that starts is recorded on the shared MockApi call log, and a
// chunk aborted mid-flight is marked 'aborted' there.

import { MockApi, AbortSignalLike } from '@shared/mock-api';

export interface TranscodeChunk {
 index: number;
 total: number;
}

/**
 * Transcode one chunk. Resolves after a per-chunk latency, or rejects with an AbortError the
 * instant `signal` fires. The MockApi records started/completed/aborted for the chunk so a test
 * can count exactly how many chunks ran.
 */
export function transcodeChunk(
 api: MockApi,
 chunk: TranscodeChunk,
 signal?: AbortSignalLike,
): Promise<TranscodeChunk> {
 return api.respond('transcode.chunk', chunk, () => chunk, signal);
}

export const TOTAL_CHUNKS = 100;
