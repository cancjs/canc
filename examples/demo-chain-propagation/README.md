# demo-chain-propagation

**Teach:** Two-way propagation on a promise chain. Cancellation flows down (source → consumers) and bubbles up (all consumers canceled → source auto-cancels). Isolation via `bubble:false`. Protection via `shield:true`.

**Domain:** Product details page load. A source promise (`loadProduct`) fans out to two consumers (`image` + `reviews`), with an audit-log write hanging off reviews. Console tracing shows when each request starts, completes, or is canceled.

## What's the difference?

### Vanilla
Four scenarios run identically in plain Promise style. There is no mechanism to cancel from the consumer side: once the source starts, all downstream requests complete regardless of user interest. Comments mark the wasted work: "keeps running", "orphaned result", "cannot stop from here".

### With CancelablePromise
Same scenarios, but now `cancel()` stops the source and all its consumers. Two key features:

- **Down propagation:** Calling `cancel()` on the source immediately rejects with `CancelError`. The AbortController fed to the mock API aborts all in-flight calls.
- **Up/bubble propagation:** If all consumers are canceled (and their results are unconsumed), the consumer counting logic automatically cancels the source too. Tracing shows this: "source aborted (bubble-up from both consumers)".

Special options:

- `{ bubble: false }` on a consumer: Its cancellation does NOT bubble up. Useful for non-critical branches (e.g., image load is optional—if the user leaves, image cancel doesn't stop the reviews consumer).
- `{ shield: true }` on a node: Protects its own cancellation from propagating down. Upstream rejection (from the canceled source) is still adopted—a shielded node still sees the parent's `CancelError`. Note: This is different from `asyncio.shield()` in Python, which stops rejection entirely. Honesty note: canc's shield stops *cancellation*, not *rejection*, so a critical failure still propagates.

## Run both flavors

```bash
yarn install
yarn start:vanilla # Plain promises: all calls complete regardless
yarn start:canc # CancelablePromise: see the cancellation in action
yarn test # Smoke tests: bubble and partial scenarios
yarn typecheck # Type-check both entrypoints
```

## Files to study

- `src/page-load-vanilla.ts` / `-canc.ts` — The teaching payload. Diff them to see how options enable two-way propagation.
- `src/main-vanilla.ts` / `-canc.ts` — Four scripted scenarios with console tracing, identical narrative flow.
- `src/scenarios.spec.ts` — Thin smoke: bubble scenario → source aborted marker present; partial scenario → source completed marker.

## Note on shield

The `shield: true` option on the audit-log node prevents its own cancellation from bubbling up to the source. However, if the source itself is canceled from above, the shield does NOT block that rejection—the `CancelError` flows through. This is intentional: a shield protects only its own cancel handlers, not upstream failures.

## Helper code

`src/report.ts` is aux scaffolding (not a copy target). It provides unified console output for both flavors.

## Copying to your project

Feel free to copy `src/lib/` (if present) and adapt the structure, but use `src/aux/` and `@shared/mock-api` as reference only—they are example-specific mocks, not reusable.
