# app-cli-graceful

Site backup CLI: crawl a page list, download every page and asset through a small concurrency
pool, write a manifest. Ctrl-C cancels the whole task tree gracefully; a second Ctrl-C forces an
immediate exit.

## Run

```
cd ../../ # monorepo root (canc)
npm run build
cd examples
npm install
npm run start:vanilla --workspace=app-cli-graceful
npm run start:canc --workspace=app-cli-graceful
npm run test --workspace=app-cli-graceful
```

Press Ctrl-C once while either entry is running to trigger a graceful stop; press it again to
force-exit immediately.

## What it shows

- `@shared/lib`'s `createPool`: a small cancel-aware concurrency pool. Canceling a job's promise
 while queued removes it from the queue so it never starts; `cancelAll()` cancels every in-flight
 job and drains the rest.
- `src/backup-canc.ts`: the pool driven from a `cancAsync` coroutine (the task tree root). One
 `backupTask.cancel()` call in `main-canc.ts` cancels every in-flight download; the coroutine's
 `finally` still runs (shielded from cancellation) so the partial manifest is always buildable
 from up-to-date data.
- `src/main-canc.ts`: SIGINT wiring. First Ctrl-C calls `await backupTask.cancel()` and only exits
 after it settles, so the manifest write is ordered strictly after cleanup instead of racing it.
 Second Ctrl-C forces `process.exit(1)` immediately.
- `src/backup-vanilla.ts` / `src/main-vanilla.ts`: the same shape with a `let aborted = false`
 flag checked between downloads. A download already in flight when the flag flips keeps running
 to completion (wasted work); the manifest write can still race a forced second-Ctrl-C exit.

## File map (diff these)

- `src/backup-vanilla.ts` vs `src/backup-canc.ts`
- `src/main-vanilla.ts` vs `src/main-canc.ts`

## Output

Both entries write their manifest under `out/` (created at runtime, gitignored): `out/backup-
manifest.canc.json` and `out/backup-manifest.vanilla.json`.

## Shutdown ordering

The canc entry's SIGINT handler awaits `backupTask.cancel()` before anything else happens:
cancellation reaches every in-flight download immediately (synchronous cancel dispatch), and the
awaited promise only settles once the coroutine's shielded cleanup has produced the final manifest
data. `main-canc.ts` writes the manifest and exits only after that await resolves, so shutdown is
ordered: cancel dispatched -> downloads stopped -> manifest data finalized -> file written -> exit.
The vanilla entry has no such ordering: the aborted flag stops new downloads from starting, but an
in-flight one keeps running, and the process can exit while a partial write or a stray timer is
still pending.

## Honesty note

Cancellation here stops the CLI's own task tree: in-flight `download` calls have their
`AbortController` triggered and their result discarded, and no further downloads are started.
It does not reach into the underlying HTTP stack (this example does not use one, `src/mock` is a
mocked fetch shape) or kill an already-open OS-level socket. Real fetch/axios integrations forward
the signal to the network layer the same way; see `demo-fetch` for a wire-level abort proof.

## Copying this code

The concurrency pool (`@shared/lib`'s `createPool`) is written to be copied into your own
project; see `examples/_shared/lib`.
