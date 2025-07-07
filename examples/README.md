# Examples

Runnable examples import `@cancjs/*` through the workspace symlinks in `node_modules` (set up by
`yarn` at the monorepo root), so run them from the repo root after `yarn` / `yarn build`.

## node-request-waterfall

Fetch-then-fetch chain, canceled partway through.

```
node examples/node-request-waterfall/waterfall.js
```

## coroutine

`cancAsync`/`cancAwait` (async..await replacement) and the typed combinators
(`cancAwait.all/race/any/allSettled`).

```
node examples/coroutine/basic.js
node examples/coroutine/iterator.js
```

## decorators

Three decorator flavors wrap the same `cancAsync(fn, ctx)` call `@cancjs/coroutine` exposes
directly (see the `@cancjs/decorators` and `@cancjs/coroutine` READMEs for the full proto/instance
placement tradeoff).

`manual-wiring.js` is the one example in this folder that runs standalone under plain `node` — it
uses `cancAsync` directly with no decorator transform:

```
node examples/decorators/manual-wiring.js
```

`stage3.ts` and `legacy.ts` are type-checked against this repo's TypeScript setup
(`tsconfig.stage3.json` / `tsconfig.legacy.json` in this folder):

```
npx tsc --noEmit --project examples/decorators/tsconfig.stage3.json
npx tsc --noEmit --project examples/decorators/tsconfig.legacy.json
```

They aren't executed here — stage-3 decorators need a TS 5+ (or matching Babel) transform, and TS
legacy decorators need `experimentalDecorators: true` wired into a build. Copy the file into a
project with that toolchain to run it.

`babel-legacy.js` documents the same pattern for `@babel/plugin-proposal-decorators` (`legacy:
true`) + `@babel/plugin-proposal-class-properties` (loose mode). This repo has no Babel toolchain,
so it's reference-only; copy it into a project with that Babel config to run it.

## react-unmount-cancel

`App.jsx` documents the pattern from the project README's "Motivation" section: one cancelable
promise chain per effect, one `cancel()` call in the cleanup function, instead of a manual
`isUnmounted` flag plus a separate `AbortController`. This repo has no React dependency, so it's
reference-only; copy the pattern into a React project with `@cancjs/promise` installed.
