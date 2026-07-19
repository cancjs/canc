# demo-fetch: GitHub Repo Search

Demonstrates cancelable fetch in a realistic chain: search repositories, fetch the readme of the top hit. Teaches chain cancellation, external abort signals, pre-aborted signals, and timeout composition.

## Domain

GitHub-style repository search. Search endpoint returns a list; follow-up readme fetch occurs on user-selected result (or top hit in this demo).

## Teaching Goals

- **Chain cancellation:** cancel() flows through .then() chain → both fetches aborted.
- **External abort signals:** AbortController signal passed into fetch — either fires independently.
- **Pre-aborted signals:** signal already aborted when fetch starts → rejects immediately (born-canceled), no network call.
- **Timeout composition:** timeout() wraps the promise chain; on timeout, underlying fetches canceled.
- **Vanilla bloat:** manual AbortController threading + combining external signal with timeout + listener cleanup. See the plumbing.

## Running

Requires: Node.js, `npm run build` in monorepo root (consumes dist packages).

```bash
# Uncancelable + workaround flavor
npm run start:vanilla

# Clean cancellation via canc-fetch + canc-toolbox
npm run start:canc

# Smoke tests
npm run test

# Type check
npm run typecheck
```

## File Map

- `src/repo-search-vanilla.ts` / `-canc.ts` — twin modules (payload). Vanilla has `searchRepos` (uncancelable, comments) + `searchReposAbortable` (workaround). Canc has `searchRepos` + `searchReposWithExternal` + `searchReposPreAborted` + `searchReposWithTimeout`.
- `src/main-vanilla.ts` / `main-canc.ts` — scenarios: uncancelable, external abort, timeout.
- `src/repo.ts` — shared types.
- `test/smoke.spec.ts` — thin smoke: verify cancel → fetch aborted marker, timeout → aborted marker.

## Diff

Both flavors align on function names (modulo `Abortable`/`WithExternal`/etc suffixes) and export positions. Vanilla's boilerplate is the teaching point — see the comment markers for side effects.

Example vanilla → canc transition:

```ts
// Vanilla: manual signal wiring
const controller = new AbortController();
// ... attach external signal listener
// ... timeout logic
try {
 const res = await fetch(url, { signal: combinedSignal });
 // ...
} finally {
 if (timeoutId) clearTimeout(timeoutId);
}

// Canc: fetch + timeout compose cleanly
const promise = cancelableFetch(url).then(/* ... */);
return timeout(promise, ms);
```

## Honesty Notes

- **Chain**: cancellation stops at fetch level (abort sent to underlying API; query already in flight when cancel() fires may still complete server-side).
- **External signals**: standard AbortSignal shapes; fallback to onabort for legacy polyfills.
- **Pre-aborted**: fetch rejects before any network call; truly born-canceled.
- **Timeout**: underlying promise canceled when ms elapses; fetch network cancel follows immediately.

## Copy

Helper code in `src/lib/` (future extraction targets) is publishable-tidy. Aux code and mock-api are scaffolding — copy src/repo-search-canc.ts for your use case, not the aux.
