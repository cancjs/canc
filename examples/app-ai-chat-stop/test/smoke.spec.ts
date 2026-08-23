import { ChatRequest, UsageLog } from '../src/chat';
import { streamChat as streamChatCanc } from '../src/chat-service-canc';
import { streamChat as streamChatVanilla } from '../src/chat-service-vanilla';

// mock streaming model with per-token latency for deterministic cancellation

const request: ChatRequest = { prompt: 'reset my password and update my billing address' };

// The mock streams one token per whitespace-delimited chunk of `echo: <prompt>`.
const fullTokens = `echo: ${request.prompt}`.split(/(\s+)/).filter((t) => t.length > 0).length;

describe('app-ai-chat-stop smoke', () => {
  it('canc: a Stop mid-stream cancels the chain and records a canceled usage entry', async () => {
    const log = new UsageLog();
    const received: string[] = [];

    // A real Stop arrives as a disconnect event, so defer the cancel a microtask to model that.
    const chat = streamChatCanc(
      request,
      {
        write(token) {
          received.push(token);
          if (received.length === 2) queueMicrotask(() => void chat.cancel());
        },
      },
      log,
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

    // no signal reaches the model here
    await streamChatVanilla(request, { write: (token) => received.push(token) }, log);

    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].canceled).toBe(false);

    // Every token of the reply was streamed and billed.
    expect(received).toHaveLength(fullTokens);
    expect(log.entries[0].tokens).toBe(fullTokens);
  });
});
