// Vanilla chat service: an AbortController threaded through every layer by hand.
//
// Two flavors live here (the plain uncancelable one and the abortable workaround) so the twin
// file mapping stays one-to-one. The uncancelable flavor is the money shot: after the user hits
// Stop the socket is gone, but the loop keeps pulling tokens we are billed for.

import { createLlm, isAbortError, Llm } from './mock/llm';
import { ChatRequest, UsageLog } from './chat';

export interface ChatSink {
 write(token: string): void;
}

// Uncancelable: no signal reaches the LLM. Stop closes the browser socket, but this loop keeps
// consuming (and paying for) tokens until the model finishes on its own.
export async function streamChat(req: ChatRequest, sink: ChatSink, log: UsageLog): Promise<void> {
 const llm = createLlm();
 let canceled = false;

 try {
 await llm.moderate(req.prompt, neverAborts());
 for await (const token of llm.stream(req.prompt, neverAborts())) {
 // tokens already paid for keep arriving here, even after the user left
 sink.write(token);
 }
 } finally {
 log.record({ prompt: req.prompt, tokens: llm.usage().tokens, canceled });
 }
}

// Abortable workaround: an AbortController is threaded into moderate and the stream. The caller
// must remember to abort it on disconnect, and every layer re-checks error.name === 'AbortError'.
export async function streamChatAbortable(
 req: ChatRequest,
 sink: ChatSink,
 log: UsageLog,
 controller: AbortController
): Promise<void> {
 const llm = createLlm();
 let canceled = false;

 try {
 await llm.moderate(req.prompt, controller.signal);
 for await (const token of llm.stream(req.prompt, controller.signal)) {
 // aborting the controller stops the loop, but only because the signal was threaded here
 sink.write(token);
 }
 } catch (error) {
 if (isAbortError(error)) {
 canceled = true; // an aborted stream is not a failure, so swallow it after flagging it
 } else {
 throw error;
 }
 } finally {
 log.record({ prompt: req.prompt, tokens: llm.usage().tokens, canceled });
 }
}

// A signal that never fires, so the uncancelable flavor type-checks against the same LLM shape.
function neverAborts(): AbortSignal {
 return new AbortController().signal;
}
