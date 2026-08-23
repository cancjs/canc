// Pretend this is the answer generator: the default here is a keyless mock stream
// (mockApi.chat.stream) so the example runs with no API key and no network. It is signal-aware: an
// abort mid-stream stops emitting tokens, and the mock records the aborted token as a call marker.
//
// Swapping in a real model is a configuration change that does not touch the pipeline, as any SDK
// accepting an AbortSignal drops in here (for example, passing the signal to an OpenAI chat stream).
//
// The pipeline calls generate(prompt, signal) either way, so cancellation reaches the model call
// through the same signal it uses for every other step.

import type { AbortSignalLike, ChatApi } from '@shared/mock-api';

/** Streams the answer token by token, honoring `signal`. Yields strings; join for the full text. */
export function generate(
  chatApi: ChatApi,
  prompt: string,
  signal?: AbortSignalLike,
): AsyncGenerator<string, void, void> {
  return chatApi.stream(prompt, signal);
}
