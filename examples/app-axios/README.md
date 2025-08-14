# app-axios — Axios Adapter with Cancelable Requests

An issue tracker API client using axios, demonstrating how to make axios request methods return `CancelablePromise` via the `cancAxios` adapter wrapper.

## What it teaches

The `cancAxios(instance)` adapter (in `src/lib/canc-axios.ts`) wraps an axios instance so all request methods return `CancelablePromise`. Calling `.cancel()` on the returned promise aborts the underlying request via `AbortSignal`, with cancellation flowing through axios' response interceptors.

The vanilla twin uses the manual registry pattern every app reinvents: track every in-flight request ID, maintain an `AbortController` per request, and manually clean up on settle. When a new request supersedes an old one, the old request still completes (its result is discarded) but resources must be managed by hand.

The canc twin simply calls `.cancel()` on the previous promise before starting a new one—no registry boilerplate, no manual cleanup.

## Files to review

- `src/lib/canc-axios.ts` — the adapter (use `cancelify` to wrap signal-aware axios calls)
- `src/issues-client-vanilla.ts` / `src/issues-client-canc.ts` — issue client twins
- `src/main-vanilla.ts` / `src/main-canc.ts` — scenario: search supersedes previous search

## Cancellation depth

Axios itself does not natively cancel the underlying fetch; it respects the `signal` option passed to the underlying transport. The mock adapter aborts immediately. A real axios instance with the default fetch transport honors the signal via fetch's native abort.

## Running both flavors

```bash
npm run start:vanilla # vanilla: registry pattern, manual cleanup
npm run start:canc # canc: direct .cancel(), no boilerplate
```

## Testing

```bash
npm test # smoke test: verify cancellation aborts the request via AbortSignal
```

## Future extraction

This adapter is a prototype seed for a future `@cancjs/axios` package. Copy `src/lib/canc-axios.ts` freely for your own projects.
