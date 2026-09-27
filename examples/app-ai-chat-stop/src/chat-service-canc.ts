// canc chat service: stream boundary is cancelified for plain async/await

import * as canc from '@cancjs/coroutine';
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
const streamTurn = cancelify(async ({ getSignal }, prompt: string, sink: ChatSink) => {
  const signal = getSignal();
  await llm.moderate(prompt, signal);
  for await (const token of llm.stream(prompt, signal)) {
    sink.write(token);
  }
});

// Cancelable: canceling the returned promise cancels streamTurn, which aborts the signal.
export function streamChat(req: ChatRequest, sink: ChatSink, log: UsageLog): CancelablePromise<void> {
  let completed = false;

  return canc.async(function* () {
    try {
      yield* canc.await(streamTurn(req.prompt, sink));
      completed = true;
    } finally {
      // Real cleanup, not abort bookkeeping: records what was billed either way.
      log.record({ prompt: req.prompt, tokens: llm.usage().tokens, canceled: !completed });
    }
  })();
}
