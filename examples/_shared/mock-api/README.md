# @canc-examples/mock-api

Signal-aware fake API shared by the canc examples.

**Not for copying.** This is aux scaffolding for the examples, not a library. It exists so a demo
can prove that a `cancel()` really reached a simulated network call, rather than just dropping the
result on the floor. When you read an example, treat this package as "your API client" and focus on
the cancellation code around it.

## What it gives you

- Typed async endpoints across a handful of domains (products/orders, flights, quotes/suppliers,
 music, invoices, hotels, prices, issues, docs+embeddings, a token stream).
- `AbortSignal` support on every call. Abort mid-latency and the call rejects with an `AbortError`.
- A call log (`mockApi.calls`) with `started` / `completed` / `aborted` markers, so a test or a
 demo's console can show the request was in flight when it was canceled.
- Deterministic seed mode (`{ seedMode: true }`) for tests: zero latency and reproducible
 pseudo-random picks.
- `createMockFetch(api)` (fetch-shaped, injected into the `@cancjs/fetch` factory in demos) and
 `createMockAxiosAdapter(api)` (axios-adapter-shaped).

## Usage

```ts
import { createMockApi } from '@canc-examples/mock-api';

const mock = createMockApi({ latency: 50 });

const controller = new AbortController();
const pending = mock.products.list(controller.signal);
controller.abort();
// pending rejects with an AbortError; mock.api.calls shows the 'aborted' marker.
```
