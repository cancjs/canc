// Canc chat service: the LLM boundary is cancelified once, so the coroutine body reads like plain
// async/await with no signal in sight. Canceling the chat cancels the wrapped call, which aborts
// the underlying signal, so a Stop stops the in-flight request and token billing rather than only
// dropping the local pull.

import { cancAsync, cancAwait } from '@cancjs/coroutine';
import { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';

import { ChatRequest, UsageLog } from './chat';
import { createLlm } from './mock/llm';

export interface ChatSink {
  write(token: string): void;
}

const llm = createLlm();

// Cancelified once: getSignal() is called a single time and the signal stays live for the whole
// moderate-then-stream turn, since the wrapping promise only settles once streamTurn resolves.
// That is what lets a Stop abort mid-stream, not just before the first token.
const streamTurn = cancelify(async ({ getSignal }, [prompt, sink]: [string, ChatSink]) => {
  const signal = getSignal();
  await llm.moderate(prompt, signal);
  for await (const token of llm.stream(prompt, signal)) {
    sink.write(token);
  }
});

// Cancelable: canceling the returned promise cancels streamTurn, which aborts the signal the LLM
// sees. Stop cancels the chain, and nothing below the cancel point runs (no wasted paid tokens).
export function streamChat(req: ChatRequest, sink: ChatSink, log: UsageLog): CancelablePromise<void> {
  let completed = false;

  return cancAsync(function* () {
    try {
      yield* cancAwait(streamTurn(req.prompt, sink));
      completed = true;
    } finally {
      // Real cleanup, not abort bookkeeping: records what was billed either way.
      log.record({ prompt: req.prompt, tokens: llm.usage().tokens, canceled: !completed });
    }
  })();
}
