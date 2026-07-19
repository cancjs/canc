# app-react-zustand

Media library browser: an albums grid and a track list. Clicking an album loads its tracks;
clicking a second album before the first load finishes is the whole point of the example.

Domain: a user browses albums, picks one, sees its tracks. Switching albums fast (or leaving the
page) should not let a stale response overwrite what the user is actually looking at.

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
npm run dev:vanilla --workspace=app-react-zustand
npm run dev:canc --workspace=app-react-zustand
npm run start:vanilla --workspace=app-react-zustand # production build + preview
npm run start:canc --workspace=app-react-zustand
npm run test --workspace=app-react-zustand
```

Open the printed preview URL, click an album, then click another one quickly.

## Switch semantics

Both stores expose the same shape: `currentAlbumId`, `tracks`, `status`, `loadAlbum(id)`,
`reset()`. The difference is what happens to the request a `loadAlbum` call interrupts.

- **canc.** The store keeps the in-flight load in `currentLoad: CancelablePromise | null`.
 `loadAlbum` cancels it before starting the next one: `get().currentLoad?.cancel()`, one line.
 Only the surviving run ever calls `set(...)`, so `tracks` always matches `currentAlbumId`, even
 if a user clicks through five albums in a row. `reset()` (called on unmount) cancels whatever is
 still outstanding the same way.
- **vanilla.** Plain promises cannot be interrupted, so the store falls back to the standard
 zustand-folk workaround: a request-id counter bumped at the start of every `loadAlbum` call, and
 every `.then` callback checks `if (id !== latestId) return` before writing state. The request
 still completes on the wire; only the state write is skipped. `reset()` cannot stop anything
 already in flight either, it just bumps the counter.

## Cancel in the store, not in the component

`Library-vanilla.tsx` and `Library-canc.tsx` are identical except for which store they import.
Neither component knows anything about cancellation, staleness, or request ids: they read
`albums` / `tracks` / `status` off selectors and call `loadAlbum` / `reset`. All of the policy for
"what happens when you switch albums" lives in the store, where it can be tested and reasoned
about without mounting a component.

## Files to diff

- `src/store-vanilla.ts` vs `src/store-canc.ts`: the store. This is the payload; everything else
 is shared plumbing.
- `src/Library-vanilla.tsx` vs `src/Library-canc.tsx`: thin, aligned components. Same JSX, same
 selectors, only the store import differs.
- `src/main-vanilla.tsx` / `src/main-canc.tsx`: entry points.
- `src/mock/media-api.ts` is shared scaffolding wrapping `@shared/mock-api`'s music domain
 (albums/tracks) — pretend this is your API client.

## What it shows

- **Switch semantics.** Click album A then album B before A's track list arrives: the canc store
 cancels A's load, so `tracks` only ever reflects B. The vanilla store lets A's request finish
 anyway (its result is just discarded); both track requests still hit the mock API.
- **One cancel call, not a counter.** The canc store has no request-id bookkeeping. Cancelling the
 previous `CancelablePromise` is enough: `loadTracks`/`loadAlbumsList` are `cancelify`'d wrappers
 around `mediaApi`, so canceling the promise aborts the underlying call automatically.
- **Unmount cancels too.** `reset()` is called from the component's cleanup effect on unmount, and
 in the canc store that cancels whatever load was still outstanding.

## Copying

`src/store-canc.ts`'s pattern, one `CancelablePromise` field per in-flight action, cancel it
before starting the next, is the reusable piece for any zustand store with switchable async
actions. Wrapping the API calls with `cancelify` instead of hand-building a `CancelablePromise`
and `AbortController` is the reusable piece for the API layer itself. `src/mock/media-api.ts` is
scaffolding for this demo, not something to copy.
