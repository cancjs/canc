# demo-promise-basics

Pilot skeleton that proves the examples workspace mechanics: `link:` resolution at runtime,
types resolving from each package's built `dist`, and the jest / tsx / typecheck runners.

The content here is a placeholder and gets replaced by the real example later.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a yarn `link:`.
Build the monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
yarn build
cd examples
yarn
```

## Run

```
yarn workspace @canc-examples/demo-promise-basics start:vanilla
yarn workspace @canc-examples/demo-promise-basics start:canc
```

Both entries do the same tiny task (load a profile, then lose interest). The vanilla entry
threads an `AbortController` and checks the error name; the canc entry calls `cancel()` once and
catches an ordinary `CancelError`.

## Domain

User profile fetch. Node stack. Uses `@cancjs/promise`.
