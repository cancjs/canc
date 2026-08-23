// mock answer generator streaming without API key or network

import type { AbortSignalLike, ChatApi } from '@shared/mock-api';

/** Streams the answer token by token, honoring `signal`. Yields strings; join for the full text. */
export function generate(
  chatApi: ChatApi,
  prompt: string,
  signal?: AbortSignalLike,
): AsyncGenerator<string, void, void> {
  return chatApi.stream(prompt, signal);
}
