# demo-chain-propagation

**Teach:** Two-way propagation on a promise chain. Cancellation flows down (source to consumers) and bubbles up (all consumers canceled means source auto-cancels). Isolation via `bubble:false`. Protection via `shield:true`.

**Domain:** Product details page load. Four requests go out together: the product, its stock, its orders, and an audit-log write. The page promise then fans out to two consumers, one reading `stock` and one reading `orders`. Console tracing shows when each request starts, completes, or is canceled.

## What's the difference?

### Vanilla
Four scenarios run identically in plain Promise style. There is no mechanism to cancel from the consumer side: once the source starts, all downstream requests complete regardless of user interest. Comments mark the wasted work: "keeps running", "orphaned result", "cannot stop from here".

### With CancelablePromise
Same scenarios, but now `cancel()` stops the source and all its consumers. Each leaf fetch is wrapped once with `cancelify`, so every leg is already a cancelable node. No hand-rolled AbortController appears anywhere in the example. Two key features:

- **Down propagation:** All four requests start before the coroutine first suspends, so a `cancel()` arriving on the next tick finds them in flight. The cancel reaches the promise the coroutine is currently suspended on. Its `finally` block then cancels the legs that were started alongside it, and all four mock calls end up `aborted`. Worth knowing: canceling a combinator result does not cancel its inputs. `CancelablePromise.all()` cancels the remaining inputs when one of them rejects, which is a different trigger.
- **Up/bubble propagation:** If all consumers are canceled (and their results are unconsumed), the consumer counting logic automatically cancels the source too. Tracing shows this: "source aborted (bubble-up from both consumers)".

Special options:

- `{ bubble: false }` on a consumer: its cancellation does NOT bubble up. Useful for non-critical branches (stock fetch is optional, so if the user leaves, canceling the stock leg alone should not stop the orders consumer). `loadProductProfile` accepts this option, but none of the four scenarios passes it. The partial scenario shows the related default instead: one consumer cancels, the other still consumes the source, so the source survives on consumer counting alone.
- `{ shield: true }` on a node: protects its own cancellation from propagating down. Upstream rejection from the canceled source is still adopted (a shielded node still sees the parent's `CancelError`). This differs from `asyncio.shield()` in Python, which stops rejection entirely. Honesty note: canc's shield stops cancellation, not rejection, so a critical failure still propagates.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a npm `file:`.
Build the monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
npm run build
cd examples
npm install
```

## Run both flavors

```bash
npm run start:vanilla # Plain promises: all calls complete regardless
npm run start:canc # CancelablePromise: see the cancellation in action
npm run test # Smoke tests: all four scenarios
npm run typecheck # Type-check both entrypoints
```

## Files to study

- `src/page-load-vanilla.ts` / `-canc.ts`: the teaching payload. Diff them to see how options enable two-way propagation.
- `src/main-vanilla.ts` / `-canc.ts`: four scripted scenarios with console tracing, identical narrative flow.
- `src/scenarios.spec.ts`: thin smoke, one case per scenario. Each case asserts the full mock call log: which four endpoints ran, in which order, and whether each one aborted or completed.

## Note on shield

The `shield: true` option on the audit-log node prevents its own cancellation from bubbling up to the source. However, if the source itself is canceled from above, the shield does NOT block that rejection: the `CancelError` flows through. This is intentional. A shield protects only its own cancel handlers, not upstream failures.

## Helper code

`src/report.ts` is example-specific util code (not a copy target). It provides unified console output for both flavors.

## Copying to your project

Feel free to copy `src/lib/` (if present) and adapt the structure, but use `@shared/mock-api` as reference only. It is an example-specific mock, not reusable.
