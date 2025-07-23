# demo-coroutine

Learn `cancAsync` and `cancAwait` through a realistic checkout flow.

## What it shows

- **Typed `yield* cancAwait()`**: Each awaited step is visibly typed (TypeScript `satisfies` shows result types inline).
- **Parallel steps with `cancAwait.all`**: Charge and loyalty-points calls run concurrently; cancelling one cancels both.
- **Cancel between steps**: If the client cancels while payment is processing, the reservation is automatically released via a shielded `finally` block.
- **Awaitable cancel**: `await checkout.cancel()` waits for cleanup to finish before returning.

## Domain

E-commerce checkout flow: reserve stock → charge payment (+ accrue loyalty points) → send confirmation email. If canceled mid-payment, the reservation is released to free stock for other customers.

## How to run

### Prerequisites

Build the monorepo first to generate `/packages/*/dist`:

```bash
cd ../.. # back to monorepo root
yarn build
```

Then enter the examples workspace:

```bash
cd examples/demo-coroutine
yarn install
```

### Vanilla flavor (with AbortSignal)

Shows the same checkout using native AbortSignal threading. Every step must check the signal after awaiting:

```bash
yarn start:vanilla
```

Look for the comments marking signal-check sites. The vanilla version has 5 signal touchpoints vs. 0 in the canc version.

### Cancelable flavor (with cancAsync)

The same checkout using `cancAsync` — cancellation is ambient, no per-step checks:

```bash
yarn start:canc
```

### Both flavors typecheck

```bash
yarn typecheck
```

### Smoke tests

```bash
yarn test
```

## Files to compare

Use `diff` or a side-by-side viewer to see the mechanical differences:

```bash
diff src/checkout-vanilla.ts src/checkout-canc.ts
diff src/main-vanilla.ts src/main-canc.ts
```

The vanilla twin carries comments at every consequence point: "must remember to check the signal here" vs. the canc twin's "cancellation is ambient".

## Depth notes

**Stock reservation cleanup on cancel**: The `finally` block in both flavors ensures the reservation is released. In the canc version, the finally block's `yield* cancAwait()` call is shielded from further cancellation by the coroutine runtime (D23 drain) — cleanup proceeds even if cancel was requested. The vanilla version relies on AbortSignal semantics: within a finally block, the signal is already checked, and cleanup proceeds.

## Helper code

None in this example (src/lib not used).

---

**canc-promise** and **canc-coroutine** are always live here — feel free to copy this directory as a template.
