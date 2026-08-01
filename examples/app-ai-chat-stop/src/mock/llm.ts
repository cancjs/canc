// Mock code: the LLM boundary. Pretend this is your OpenAI client. Both flavors of the chat
// service call THIS module, never the SDK directly, so the vanilla/canc twins stay identical in
// shape and only differ in how they wire cancellation.
//
// Keyless by default: a mock token streamer from @shared/mock-api. Set OPENAI_API_KEY to route
// the same calls through the real OpenAI SDK (an optional dependency). The call shape is
// identical either way: a moderation check, then a token stream, both accepting an AbortSignal.

import { isAbortError as isMockAbortError } from '@cancjs/toolbox';
import { createMockApi } from '@shared/mock-api';

export interface Llm {
  /** Rejects when the prompt is disallowed; resolves otherwise. Honors the abort signal. */
  moderate(prompt: string, signal: AbortSignal): Promise<void>;
  /** Streams reply tokens, aborting mid-stream the instant the signal fires. */
  stream(prompt: string, signal: AbortSignal): AsyncIterable<string>;
  /** Approximate paid tokens seen so far. Real billing is per-token; this stands in for it. */
  usage(): { tokens: number };
}

/** True when an error is the mock or SDK abort signal firing, regardless of source. */
export function isAbortError(error: unknown): boolean {
  if (isMockAbortError(error)) return true;
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

/** Builds the mock or real LLM depending on OPENAI_API_KEY. */
export function createLlm(): Llm {
  return process.env.OPENAI_API_KEY ? createRealLlm() : createMockLlm();
}

function createMockLlm(): Llm {
  // Per-token latency so a mid-stream Stop lands between tokens, like a real streamed completion.
  const mockApi = createMockApi({ latency: 80, jitter: 0 });
  let tokens = 0;

  return {
    async moderate(prompt, signal) {
      if (/\bnuke\b/i.test(prompt)) throw new Error('moderation: prompt rejected');
      // A cheap network round-trip so cancellation before the stream is observable too.
      await mockApi.issues.list(signal);
    },
    async *stream(prompt, signal) {
      for await (const token of mockApi.chat.stream(prompt, signal)) {
        tokens++; // Each yielded token is a token we were billed for.
        yield token;
      }
    },
    usage() {
      return { tokens };
    },
  };
}

// Real OpenAI SDK path. Same call shape: the SDK takes { signal } on each request, so aborting the
// signal aborts the in-flight HTTP request and stops token billing at the provider.
function createRealLlm(): Llm {
  // Imported lazily so the mock path never needs the optional dependency installed.
  const OpenAI = require('openai').default as typeof import('openai').default;
  const client = new OpenAI();
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  let tokens = 0;

  return {
    async moderate(prompt, signal) {
      const result = await client.moderations.create({ input: prompt }, { signal });
      if (result.results[0]?.flagged) throw new Error('moderation: prompt rejected');
    },
    async *stream(prompt, signal) {
      const completion = await client.chat.completions.create(
        { model, messages: [{ role: 'user', content: prompt }], stream: true },
        { signal },
      );
      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          tokens++;
          yield delta;
        }
      }
    },
    usage() {
      return { tokens };
    },
  };
}
