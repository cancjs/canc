# Paginated Feed Streaming Example

Demonstrates consuming a cursor-paginated activity feed using an async iterable stream and canceling it.

## What it shows

- **Cancelable streaming**: Using `cancForAwait` to stream an async iterable feed. When the consumer stops early or the coroutine is canceled, the upstream generator (`cancGenAsync`) automatically stops paginating, and the in-flight network request aborts.
- **Fair comparison**: The `-vanilla` twin requires a manual `AbortController` threaded everywhere, checking the signal before and after every step, to achieve the same result.

## Honesty Note

Cancellation stops the NEXT page fetch and aborts the currently in-flight one. Any items already received and yielded before the cancellation are kept and processed by the current consumer iteration, up to the point where the stream breaks.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a npm `file:`.
Build the monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
npm run build
cd examples
npm install
```

## How to run

```bash
# Vanilla plain-promises with AbortController threading
npm run start:vanilla

# Canc-native coroutine streams
npm run start:canc
```

## File map (what to read side-by-side)

- `src/feed-streaming-canc.ts` vs `src/feed-streaming-vanilla.ts`: streaming producer and consumer. Notice how canc allows signal-free consumption while vanilla requires threading the signal.
- `src/main-canc.ts` vs `src/main-vanilla.ts`: entry points that trigger cancellation.
- `src/mock/`: scaffolding for a mock latency-controlled API (ignore).

*Note: A future follow-up will demonstrate composing the stream through the `@cancjs/toolbox/async-iter` helpers once they are available.*
