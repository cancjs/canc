import { AbortError } from '@cancjs/toolbox';

import { AbortSignalLike, MockApi } from '../core';

export interface ChatApi {
  /** Streams tokens with a per-token delay, aborting mid-stream when the signal fires. */
  stream(prompt: string, signal?: AbortSignalLike): AsyncGenerator<string, void, void>;
}

// Token stream: each token is an independently abortable and traced respond().
async function* streamTokens(
  api: MockApi,
  prompt: string,
  signal?: AbortSignalLike,
): AsyncGenerator<string, void, void> {
  const tokens = `echo: ${prompt}`.split(/(\s+)/).filter((t) => t.length > 0);
  for (let i = 0; i < tokens.length; i++) {
    if (signal?.aborted) throw new AbortError();
    const token = await api.respond(`chat.token[${i}]`, { i }, () => tokens[i], signal);
    yield token;
  }
}

export function createChatApi(api: MockApi): ChatApi {
  return {
    stream: (prompt, signal) => streamTokens(api, prompt, signal),
  };
}
