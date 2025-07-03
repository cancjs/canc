<p align="center">
 <img src="../../assets/canc-logo.png" width="483" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; a crafty foundation for cancelable promises">
</p>

<h1 align="center">@cancjs/promise</h1>

<p align="center">
Cancelable promise implementation based on native <code>Promise</code>.
</p>

---

## Features

* cancelable promise implementation built on top of native ES `Promise`
* cancellation is a special rejection (`CancelError`) — normal `try`/`catch`/`.then`/`.catch`
 semantics preserved
* two-way cancellation: propagates down the chain, bubbles back up when every consumer has
 canceled and the value is unconsumed
* CJS, ESM and UMD builds; TypeScript types down to TS 4.2

See the [root README](../../README.md) for the full ecosystem and cancellation model.

## Install

```sh
npm install @cancjs/promise
# or
yarn add @cancjs/promise
```

## Usage

```js
const { CancelablePromise, CancelError } = require('@cancjs/promise');
// or: import { CancelablePromise, CancelError } from '@cancjs/promise';

const promise = new CancelablePromise((resolve, reject, onCancel) => {
 const id = setTimeout(resolve, 1000, 'done');
 onCancel(() => clearTimeout(id));
});

promise
 .then((value) => console.log(value))
 .catch((err) => {
 if (err instanceof CancelError) {
 console.log('canceled');
 }
 });

promise.cancel();
```

## Build targets

All four build outputs are produced from the same ES5-targeted TypeScript source (`target: es5`
in `tsconfig.base.json`), only module wrapping differs between formats: `dist/index.cjs` is
CommonJS for `require()` and Node.js (`main` field), `dist/index.mjs` is an ES module for
`import` and bundlers (`module` field), `dist/index.umd.js` is UMD for `<script>` tags/AMD/
CommonJS fallback, and `dist/index.umd.min.js` is the minified UMD build used by `unpkg`/
`jsdelivr`.

## TypeScript support

TypeScript floor is 4.2. Two `.d.ts` variants ship, resolved automatically, no consumer
configuration needed. TS >= 4.7 reads `exports["."].types` conditions and gets
`dist/types/index.d.ts`. Older TS falls back to `typesVersions` (pre-4.7 resolvers don't support
the `exports.types` condition) and gets `dist/types-ts4.2/index.d.ts`.

`dist/types-ts4.2/` is generated from `dist/types/` via `downlevel-dts`, plus a follow-up patch
for `Awaited<T>` (lib-defined starting TS 4.5, not covered by `downlevel-dts`'s own transform
list). Verified against a pinned TS version matrix: 4.2, 4.7, 5.0, 5.4, latest.

## Engines

`node >= 18` (declared in `package.json` engines), the tested and supported Node.js baseline for
the published package. See the [root README Compatibility section](../../README.md#compatibility)
for browser/engine notes, including QuickJS, XS (Moddable) and Hermes.

## License

[MIT](../../LICENSE)
