// Canc chat service: a cancAsync coroutine whose cancellation drives the LLM's AbortSignal.
//
// One flavor is enough here: cancel() flows down the chain, abandoning the coroutine, so there is
// no manual abort bookkeeping to mirror. createAbortSignal mints one canc-aware signal for the whole
// request; the coroutine's finally aborts it on cancel, so a Stop aborts the in-flight request and
// stops token billing rather than only dropping the local pull.

import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { CancelablePromise, createAbortSignal } from '@cancjs/promise';
import { createLlm } from './aux/llm';
import { ChatRequest, UsageLog } from './chat';

export interface ChatSink {
 write(token: string): void;
}

// Cancelable: the coroutine's own cancellation aborts the signal the LLM sees. Stop cancels the
// chain, the signal fires, and nothing below the cancel point runs (no wasted paid tokens).
export function streamChat(req: ChatRequest, sink: ChatSink, log: UsageLog): CancelablePromise<void> {
 const llm = createLlm();
 // One canc-aware signal for the whole request. Aborting it reads as a genuine cancellation, so a
 // spec-compliant client rejects the in-flight request with our CancelError.
 const cancelSignal = createAbortSignal();

 return cancAsync(function* () {
 let completed = false;
 try {
 yield* cancAwait(llm.moderate(req.prompt, cancelSignal.signal));
 // Stream tokens as they arrive; cancForAwait cancels the source on coroutine cancel, so a Stop
 // stops the pull between tokens and nothing below runs for a dead socket.
 yield* cancForAwait(llm.stream(req.prompt, cancelSignal.signal), (token) => {
 sink.write(token);
 });
 completed = true;
 } finally {
 // The finally always runs (normal end or cancel). On cancel it aborts the outbound signal so
 // the in-flight request stops at the provider, then records what was billed either way.
 if (!completed) cancelSignal.abort();
 log.record({ prompt: req.prompt, tokens: llm.usage().tokens, canceled: !completed });
 }
 })() as CancelablePromise<void>;
}
