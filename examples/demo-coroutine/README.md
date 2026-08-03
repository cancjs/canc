# demo-coroutine

Learn `canc.async` and `canc.await` through a realistic checkout flow.

## What it shows

- **Typed `yield* canc.await()`**: Each awaited step is visibly typed (TypeScript `satisfies` shows result types inline).
- **Parallel steps with `canc.await.all`**: Charge and loyalty-points calls run concurrently; cancelling one cancels both.
- **Cancel between steps**: If the client cancels while payment is processing, the reservation is automatically released via a shielded `finally` block.
- **Awaitable cancel**: `await checkout.cancel()` waits for cleanup to finish before returning.
- **Cancellation gap**: the order confirmation email uses a legacy vendor call with no signal parameter. Once it starts it always finishes, in both flavors. The example marks the gap instead of hiding it.

## Domain

E-commerce checkout flow: reserve stock, charge payment (plus accrue loyalty points), then send confirmation email. If canceled mid-payment, the reservation is released to free stock for other customers.

## How to run

### Prerequisites

Build the monorepo first to generate `/packages/*/dist`:

```bash
cd ../.. # back to monorepo root
npm run build
```

Then enter the examples workspace:

```bash
cd examples/demo-coroutine
npm install
```

### Vanilla flavor (with AbortSignal)

Shows the same checkout using native AbortSignal threading. Every step must check the signal after awaiting:

```bash
npm run start:vanilla
```

Look for the comments marking signal-check sites. The vanilla version has 5 signal touchpoints vs. 0 in the canc version.

### Cancelable flavor (with canc.async)

The same checkout using `canc.async`. Cancellation is ambient, no per-step checks:

```bash
npm run start:canc
```

### Both flavors typecheck

```bash
npm run typecheck
```

### Smoke tests

```bash
npm run test
```

## Files to compare

Use `diff` or a side-by-side viewer to see the mechanical differences:

```bash
diff src/checkout-vanilla.ts src/checkout-canc.ts
diff src/main-vanilla.ts src/main-canc.ts
```

The vanilla twin carries comments at every consequence point: "must remember to check the signal here" vs. the canc twin's "cancellation is ambient".

## Depth notes

**Stock reservation cleanup on cancel**: The `finally` block in both flavors ensures the reservation is released. In the canc version, the finally block's `yield* canc.await()` call is shielded from further cancellation by the coroutine runtime. Cleanup proceeds even if cancel was requested. The vanilla version relies on AbortSignal semantics: within a finally block, the signal is already checked, and cleanup proceeds.

**Cancellation gap**: `legacyConfirmEmail` takes no signal at all, so it cannot be aborted by either flavor. It runs after the order is confirmed, so a stale email is the worst case. Not every operation can be made cancelable. The lesson is to notice the gap and judge whether it is acceptable, not to pretend it does not exist.

## Helper code

None in this example (src/lib not used). `src/mock/checkout-ops.ts` is scaffolding, not a copy target.

---

**canc-promise** and **canc-coroutine** are always live here. Feel free to copy this directory as a template.
