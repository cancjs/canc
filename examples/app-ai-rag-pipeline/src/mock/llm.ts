// Aux: the answer generator. Pretend this is your LLM. The default here is a keyless mock stream
// (mockApi.chat.stream) so the example runs with no API key and no network. It is signal-aware: an
// abort mid-stream stops emitting tokens, and the mock records the aborted token as a call marker.
//
// Swapping in a real model is a documentation-only change; you do not touch the pipeline. Any SDK
// that accepts an AbortSignal drops in here, for example (pseudo-code, not wired):
//
// import OpenAI from 'openai';
// const client = new OpenAI();
// export async function* generate(prompt: string, signal?: AbortSignal) {
// const stream = await client.chat.completions.create(
// { model: 'gpt-4o-mini', stream: true, messages: [{ role: 'user', content: prompt }] },
// { signal },
// );
// for await (const part of stream) yield part.choices[0]?.delta?.content ?? '';
// }
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
