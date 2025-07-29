// Canc chat service: a cancAsync coroutine whose cancellation drives the LLM's AbortSignal.
//
// One flavor is enough here: cancel() flows down the chain, abandoning the coroutine, so there is
// no manual abort bookkeeping to mirror. toAbortSignal bridges the coroutine's cancellation to the
// SDK's { signal } option, so a Stop actually aborts the in-flight request and stops token billing.

import { cancAsync } from '@cancjs/coroutine';
import { toAbortSignal } from '@cancjs/toolbox';
import { CancelablePromise } from '@cancjs/promise';
import { createLlm } from './aux/llm';
import { ChatRequest, UsageLog } from './chat';

export interface ChatSink {
 write(token: string): void;
}

// Cancelable: the coroutine's own cancellation becomes the AbortSignal the LLM sees. Stop cancels
// the chain, the signal fires, and nothing below the cancel point runs (no wasted paid tokens).
export function streamChat(req: ChatRequest, sink: ChatSink, log: UsageLog): CancelablePromise<void> {
 const llm = createLlm();
 // One stable signal for the whole request; the coroutine's cancellation aborts it (wired below).
 const controller = new AbortController();

 const run = cancAsync(function* () {
 let completed = false;
 const tokens = llm.stream(req.prompt, controller.signal)[Symbol.asyncIterator]();
 let pending: Promise<IteratorResult<string>> | undefined;
 try {
 yield llm.moderate(req.prompt, controller.signal);
 pending = tokens.next();
 let step = (yield pending) as IteratorResult<string>;
 while (!step.done) {
 // canceled here — cancel() abandons the coroutine and nothing below runs for a dead socket
 sink.write(step.value);
 pending = tokens.next();
 step = (yield pending) as IteratorResult<string>;
 }
 completed = true;
 } finally {
 // Cancel abandons the coroutine at the pending step, leaving the token iterator suspended on an
 // in-flight request. The bridge below aborts that request through the shared signal; catch the
 // abandoned step's rejection here so that abort never surfaces as an unhandled rejection.
 if (!completed && pending) pending.catch(() => undefined);
 // The finally always runs (normal end or cancel), so billing is always recorded either way.
 log.record({ prompt: req.prompt, tokens: llm.usage().tokens, canceled: !completed });
 }
 });

 const promise = run();
 // Inverse interop: when the coroutine cancels, its derived signal aborts our request controller,
 // which is the signal already threaded into the LLM. This is the toAbortSignal bridge.
 toAbortSignal(promise).addEventListener('abort', () => controller.abort());
 return promise as CancelablePromise<void>;
}
