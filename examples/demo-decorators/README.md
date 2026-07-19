# demo-decorators

One issue-tracker API client class, wired four different ways. The lesson is that `@cancjs/decorators`
gives you the same cancelable client whatever decorator dialect your toolchain speaks, and that the
manual desugaring is right there when you want no decorators at all.

Domain: an `IssueClient` for an issue/ticket service, with `searchIssues`, `loadIssue`, and
`saveComment`. Every flavor implements the identical class shape; only the wiring differs.

## The four flavors

Each flavor lives in its own subfolder with its own compiler/transform config, because the dialects
need different emit settings and cannot share one compilation:

- `src/stage3/` — native TC39 stage-3 decorators (TypeScript 5+, `experimentalDecorators: false`).
 Uses `AsyncMethod` / `BindMethod`.
- `src/ts-legacy/` — TypeScript legacy decorators (`experimentalDecorators: true`). Uses
 `LegacyAsyncMethod` / `LegacyBindMethod`.
- `src/babel-legacy/` — Babel legacy decorators (`@babel/plugin-proposal-decorators`, `legacy: true`).
 Written as `.js` because it needs Babel's transform. Uses `BabelLegacyAsyncMethod` /
 `BabelLegacyBindMethod`.
- `src/manual/` — no decorators at all: the constructor does `this.method = cancAsync(this.method, this)`,
 which is exactly what the decorators desugar to. Works under any toolchain.

Every flavor imports from `@cancjs/decorators`; pick the decorator matching your build. Applying a
decorator under the wrong compiler flavor fails fast with a message telling you which one to use
instead (each flavor file carries that guard message in a comment).

### About the manual flavor and the -vanilla convention

Most demos ship a `-vanilla` twin that uses plain promises so you can diff cancelable against
uncancelable. Here the interesting axis is decorator wiring versus manual wiring, not cancelable
versus uncancelable, so a plain-promise twin would teach nothing. The `manual/` flavor stands in as
the no-decorator baseline instead, and the `-vanilla` suffix pair is intentionally skipped.

## Running

Build the workspace packages first (the example consumes their built `dist`):

```
# from the monorepo root
npm run build
# then, from examples/
npm install
```

Then, from `examples/demo-decorators/`:

- `npm run start:vanilla` runs the manual flavor.
- `npm run start:canc` runs the stage-3 flavor.
- `npm run start:legacy` runs the TS-legacy flavor (its own tsconfig turns on `experimentalDecorators`).
- `npm run start:all` runs the manual, stage-3, and TS-legacy flavors in sequence for a side-by-side read.

The babel-legacy flavor needs Babel's transform to run, so it is exercised by the smoke test rather
than a `start` script.

## The scenario

Every flavor runs `src/scenario.ts`: two clients each start an in-flight `searchIssues`, then client A
cancels mid-flight. It shows that

- the canceled call rejects with a `CancelError` caught by ordinary `try/catch`,
- the cancel reaches the simulated request (the mock API logs an abort), and
- client B's independent call still resolves. Canceling one instance never disturbs another.

## Files to diff

The four `issue-client` files are the payload. Read them side by side; the method bodies are identical
and only the decorator/wiring lines change:

- `src/stage3/issue-client.ts`
- `src/ts-legacy/issue-client.ts`
- `src/babel-legacy/issue-client.js`
- `src/manual/issue-client.ts`

## Honesty note

The mock API has no write endpoint. `saveComment` reads the issue back and echoes the comment, so it
demonstrates the wiring and cancellation, not a real persisted write. Cancellation here stops the
client's request chain (it skips pending reads and rejects); it does not roll back a committed write,
because there is none.
