import { UsageLog, ChatRequest } from '../src/chat';
import { streamChat as streamChatCanc } from '../src/chat-service-canc';
import { streamChat as streamChatVanilla } from '../src/chat-service-vanilla';

// The services build their own mock LLM with a per-token latency, so a cancel issued after a couple
// of tokens lands mid-stream deterministically (no wall-clock sleeps). Cancellation is triggered off
// the token callbacks and each test awaits the service's own settlement, so timing is data-driven.

const request: ChatRequest = { prompt: 'reset my password and update my billing address' };

// The mock streams one token per whitespace-delimited chunk of `echo: <prompt>` (separators count
// as their own tokens), so the full reply is every such chunk. Derived, not hardcoded, so the
// assertions stay honest if the prompt changes.
const fullTokens = `echo: ${request.prompt}`.split(/(\s+)/).filter((t) => t.length > 0).length;

describe('app-ai-chat-stop smoke', () => {
 it('canc: a Stop mid-stream cancels the chain and records a canceled usage entry', async () => {
 const log = new UsageLog();
 const received: string[] = [];

 // A real Stop arrives as a disconnect event, never synchronously inside a token write, so defer
 // the cancel a microtask to model that. It still lands between tokens: cancellation is what ends
 // the stream, not a timer.
 const chat = streamChatCanc(
 request,
 {
 write(token) {
 received.push(token);
 if (received.length === 2) queueMicrotask(() => void chat.cancel());
 },
 },
 log
 );

 await chat.catch(() => undefined); // a canceled chat rejects with CancelError; that is expected

 // Stop landed mid-stream: only the couple of tokens seen before cancel arrived.
 expect(received).toHaveLength(2);

 // Exactly one usage entry, flagged canceled: billing stopped at the cancel point.
 expect(log.entries).toHaveLength(1);
 expect(log.entries[0].canceled).toBe(true);

 // A canceled stream bills fewer tokens than the whole reply.
 expect(log.entries[0].tokens).toBeLessThan(fullTokens);
 });

 it('vanilla uncancelable service keeps billing the whole reply (the bug we teach)', async () => {
 const log = new UsageLog();
 const received: string[] = [];

 // No signal reaches the LLM here, so nothing the caller does stops the stream. Await its own end.
 await streamChatVanilla(request, { write: (token) => received.push(token) }, log);

 expect(log.entries).toHaveLength(1);
 expect(log.entries[0].canceled).toBe(false);

 // Every token of the reply was streamed and billed. A caller that walked away could not have
 // stopped it, so the full reply arrived regardless.
 expect(received).toHaveLength(fullTokens);
 expect(log.entries[0].tokens).toBe(fullTokens);
 });
});
