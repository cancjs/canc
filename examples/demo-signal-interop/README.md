# demo-signal-interop

Learn signal ↔ promise interoperability. Gateway shim layer: cancelable promises orchestrate
signal-based APIs and vice versa.

## What it teaches

| Bridge | Use this when |
| --- | --- |
| **Signal → Promise** (`{ signal }` option) | An existing signal (AbortController, timeout, or event-driven) controls a canc promise |
| **Promise → Signal** (`toAbortSignal(p)`) | Feeding a promise to a signal-based API (like fetch SDK) |
| **Composition** (array first-wins) | Multiple abort sources (timeout + user + external) must cooperate |
| **Classification** (`CancelError`, `.aborted`, `.cause`) | Distinguish abort errors from normal failures |
| **withSignal wrapper** | Reusable cancellation wrapper for any async work |

## Running both flavors

```bash
# Vanilla: AbortController manual threading + listener cleanup
npm run start:vanilla

# Canc: { signal } option + auto cleanup
npm run start:canc
```

## File map

Diff vanilla and canc twins to see the delta:

```
src/
 in-{vanilla,canc}.ts — Signal to CancelablePromise
 out-{vanilla,canc}.ts — CancelablePromise to signal (toAbortSignal)
 compose-{vanilla,canc}.ts — AbortSignal.timeout + array composition
 classify-{vanilla,canc}.ts — Error type inspection + suppress helpers
 with-signal-{vanilla,canc} — Reusable withSignal wrapper
```

## Key points

### Signal → Promise

```ts
// Vanilla: just AbortController
const promise = mockFetch(url, controller.signal);

// Canc: { signal } option feeds it as first-class citizen
const promise = new CancelablePromise((resolve, reject) => {
 mockFetch(url).then(resolve, reject);
}, { signal: controller.signal });

// Array: first-wins (no manual any())
const promise = new CancelablePromise(…, { signal: [sig1, sig2] });

// Pre-aborted: born-canceled immediately
controller.abort();
const promise = new CancelablePromise(…, { signal: controller.signal });
// ^ rejects on construction
```

### Promise → Signal

```ts
// Vanilla: need listener + cleanup
const controller = new AbortController();
const listener = () => controller.abort();
promise.catch(err => {
 if (err.name === 'AbortError') controller.abort();
});

// Canc: toAbortSignal() converts cancellation to signal
const signal = toAbortSignal(promise);
const sdkResult = await sdk.call({ signal });
```

### Composition

```ts
// Vanilla: manual Promise.race + listener cleanup
const listeners = [];
const timeout = new Promise((_, rej) => {
 const l = () => rej(new DOMException('…'));
 timeoutSignal.addEventListener('abort', l);
 listeners.push({ signal: timeoutSignal, listener: l });
});
await Promise.race([timeout, work()]);
// finally: cleanup all listeners

// Canc: array of signals, auto cleanup
const promise = new CancelablePromise(…, {
 signal: [AbortSignal.timeout(200), userSignal],
});
```

### Classification

```ts
// Vanilla: manual .name checks
if (err instanceof DOMException && err.name === 'AbortError') {
 // abort
}

// Canc: CancelError + helpers
if (err instanceof CancelError) {
 if (err.aborted) console.log('abort, cause:', err.cause);
}

// Or: quick checks
if (isAbortError(err)) { /* … */ }
if (suppressAbort(err)) throw err; // rethrow if NOT abort
if (suppress(['abort', 'cancel'])(err)) throw err; // suppress either
```

## Honesty notes

Cancellation stops the **chain** (subsequent steps skip, results discard). Network-level kill (pg
wire cancel, streaming multipart abort) requires deeper SDK/driver support — this example
orchestrates at the promise boundary.

## Testing

```bash
npm run test # smoke tests for both entries
npm run typecheck # both flavors type-check
```

## Copy & adapt

`src/lib/` code (e.g. helpers, wrappers) is meant for copying. README states this per guideline.

## Packages used

- `@cancjs/promise` — core CancelablePromise, toAbortSignal, CancelError, helpers
- `@cancjs/toolbox` — (future: timeout/retry helpers)
