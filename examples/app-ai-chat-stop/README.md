# app-ai-chat-stop

A customer-support chat assistant with a Stop button that actually stops. Cancellation runs end to
end across three layers: the browser (fetch stream plus a Stop button and page-leave), an express
route (client-disconnect detection), and the LLM call (an AbortSignal). The point of the example is
what happens after Stop. Without cancellation the server keeps pulling tokens you already paid for.
With canc the spend stops at the cancel point.

Domain: a streaming LLM reply in a support chat.

## The money hook

Streamed completions bill per token. If the user hits Stop (or leaves the page) and the server keeps
reading the stream, every token that arrives after that is wasted spend. The vanilla leaky route
shows this directly: the socket is gone, but the loop keeps consuming and recording billed tokens.
The canc route cancels the whole handler chain on disconnect, the AbortSignal fires, and nothing
below the cancel point runs.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a yarn `link:`. Build the
monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
yarn build
cd examples
yarn
```

## Run

```
yarn workspace app-ai-chat-stop start:vanilla
yarn workspace app-ai-chat-stop start:canc
yarn workspace app-ai-chat-stop test
```

Each entry boots the express server on an ephemeral port, then drives a scripted Stop (send a
prompt, read a couple of tokens, hang up mid-stream) so the run has a deterministic end. Watch the
usage log line at the end: the canc run stops billing early, the vanilla leaky route does not.

To try the browser client by hand, open the printed `http://localhost:PORT`, send a prompt, and
press Stop mid-reply.

## Keyless by default, real SDK optional

By default the LLM boundary is a mock token streamer from `@shared/mock-api`, so the example runs
with no API key and no network. Set `OPENAI_API_KEY` to route the exact same calls through the real
OpenAI SDK (an optional dependency). The call shape is identical either way: a moderation check,
then a token stream, both taking an AbortSignal. Optionally set `OPENAI_MODEL` (default
`gpt-4o-mini`). The SDK accepts `{ signal }` on each request, so aborting the signal aborts the
in-flight HTTP request and stops token billing at the provider.

## File map (which files to diff)

- `src/server-vanilla.ts` vs `src/server-canc.ts`: the express route. Vanilla threads an
 AbortController per request and aborts it on socket `close`; canc cancels one CancelablePromise in
 a single line.
- `src/chat-service-vanilla.ts` vs `src/chat-service-canc.ts`: the streaming payload. Vanilla holds
 two functions (an uncancelable one and an abortable workaround) so the file mapping stays one to
 one; canc holds one coroutine whose cancellation drives the signal.
- `src/mock/llm.ts`: the LLM boundary (mock or real). Treat it as a black box, this is your OpenAI
 client.

The canc bridge worth studying is `streamTurn` in `chat-service-canc.ts`, a `cancelify`-wrapped
function that owns the AbortSignal for the whole moderate-then-stream turn. The coroutine never
sees the signal at all; canceling `streamChat(...)` cancels `streamTurn`, which aborts the signal
the SDK consumes, so one `cancel()` reaches all the way down to the in-flight request.

## Plumbing line count, vanilla vs canc

Counting the disconnect-and-abort wiring (the code you add purely to stop work on Stop):

- Vanilla: an AbortController per request, a `res.on('close')` handler, a `req.destroyed` check, the
 controller threaded into `moderate` and the stream, and an `error.name === 'AbortError'` ladder in
 the service. Roughly a dozen lines spread across the route and the service, and every one is a spot
 you can forget.
- Canc: `res.on('close', () => void chat.cancel())`. One line. The cancellation flows down to the
 signal on its own.

## Honesty notes

Cancellation here stops at the LLM request boundary. On the mock path, aborting ends the token
generator between tokens (the mock records an `aborted` marker). On the real path, the SDK's
`{ signal }` aborts the in-flight HTTP request, which is what stops provider-side billing. Neither
path can un-bill tokens already streamed before Stop, cancellation stops future spend, not past
spend. The usage log records `canceled: true` and the token count seen up to the cancel point.
