# app-ws-progress

Live video export progress over a WebSocket. The browser starts an export, the server streams
progress frames while it transcodes the video chunk by chunk, and the user can cancel. In the canc
version a cancel stops the transcode on the server. In the vanilla version it only stops the
progress bar; the machine keeps transcoding every remaining chunk for a socket nobody is reading.

Domain: a user exports a video, watches the progress bar, then cancels or just closes the tab.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a npm `file:`.
Build the monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
npm run build
cd examples
npm install
```

## Run

```
npm run start:vanilla --workspace=app-ws-progress
npm run start:canc --workspace=app-ws-progress
npm run test --workspace=app-ws-progress
```

Each entry boots the server, starts an export, cancels it at ~30%, and prints how many transcode
chunks the server actually ran. It does this twice: once with an explicit cancel message, once by
closing the socket outright. The canc run freezes the chunk count near the cancel point and marks
the in-flight chunk aborted. The vanilla run transcodes all 100 chunks either way.

Open http://localhost:3000 while a server is running to drive it from the browser page: Start,
then Cancel or close the tab.

## Two cancel paths

A WebSocket is bidirectional, so there are two ways to cancel, and in the canc server both land in
the same chain cancel:

- **Explicit message.** The client sends `{ type: 'cancel', jobId }`. The server cancels that one
 job. Canceling aborts the transcode chunk in flight and stops the async iterator, so no further
 chunk starts, and the server acks with a `canceled` frame.
- **Socket close.** The tab closes or the network drops. Each connection owns a cancel root, and
 every job started on that connection is a child of it. Closing the socket cancels the root, which
 cancels all of its jobs at once. This is the connection-scoped job tree: one signal tears down
 everything that connection was doing.

The vanilla server has neither a cancel root nor a way to reach the transcoder. A cancel message or
a close can only set a flag that stops SENDING frames. Every chunk still transcodes on the server.

## What it shows

- **Connection-scoped job tree (canc).** `handleConnection` creates a pending `CancelablePromise`
 as the connection's cancel root and keeps a map of the jobs under it. Both the close handler and
 the root's own rejection cancel every job in the map.
- **`events.on` + `toAbortSignal` interop (canc).** The inbound message loop is the platform's own
 `events.on(ws, 'message', { signal })` async iterator, fed a signal derived from the connection
 root with `toAbortSignal`. When the root cancels, the signal aborts and the native iterator ends,
 so the read loop unwinds with the rest of the tree. No hand-written close plumbing.
- **`cancGenAsync` export job (canc).** The export is a cancelable async generator: `yield*
 cancGenAwait(...)` transcodes a chunk internally (typed, no cast), `yield` emits a progress
 percentage to the sender's `for await`. The transcoder is cancelified once at its boundary
 (`createTranscoder`), so the job calls `transcode(chunk)` with no signal of its own. Canceling the
 iterator runs its `finally` and aborts the chunk in flight through that cancelified boundary.
- **`suppressCancel` for the ack (canc).** The `canceled` ack is sent inside `suppressCancel(...)`
  so it still goes out even though the job chain is in the middle of canceling.

## Files to diff

- `src/server-vanilla.ts` vs `src/server-canc.ts`: the connection wiring. Vanilla tracks a set of
 stopped job ids and can only gate sending; canc owns a cancel root, a job map, and a signal-fed
 message loop.
- `src/export-job-vanilla.ts` vs `src/export-job-canc.ts`: the transcode job. Vanilla is a plain
 async generator with no way to stop the work; canc is a `cancGenAsync` generator over a
 cancelified transcoder, so a job cancel aborts the chunk in flight with no signal in the loop.
- `src/main-vanilla.ts` vs `src/main-canc.ts`: the scripted runs. Same scenarios; the printed chunk
 counts diverge.

`src/protocol.ts` and `public/index.html` are shared, non-sensitive glue with no twin.

## Why WebSocket here, and what SSE would look like

The catalog domain is one-way progress streaming, which Server-Sent Events handles well: an
`EventSource` receives frames, and the server cancels the job when the HTTP request closes. That
gives one cancel path (the request close) and one connection-scoped job. This example uses a
WebSocket instead because it keeps that strength (each connection still owns a job tree that a close
tears down) and adds the second, client-driven cancel path for free: the browser can send an
explicit `{ type: 'cancel' }` frame up the same socket without opening a separate request. An SSE
version would drop the explicit-message path and cancel only on the request close. Everything else,
the connection-scoped tree, the `cancGenAsync` export job, the `finally` cleanup, would be
identical.

## Honesty notes

- **Cancellation stops between chunks, not inside one.** The mock transcoder rejects the instant its
 signal fires, so a canceled chunk is marked aborted immediately. A real encoder call may not be
 interruptible mid-frame. What cancellation reliably buys you is that no LATER chunk starts and the
 chain unwinds, which is where the wasted work is. The in-flight chunk is best-effort.
- **A closed socket cannot receive the ack.** On the socket-close path the `canceled` frame has
 nowhere to go; the point of that path is stopping server work, not notifying a client that already
 left.

## Copying

The connection-scoped root pattern in `src/server-canc.ts` and the `cancGenAsync` job in
`src/export-job-canc.ts` are the reusable pieces. `src/mock/transcode.ts` is scaffolding for this
demo, not something to copy.
