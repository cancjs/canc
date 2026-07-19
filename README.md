<h1 align="center">
 <img src="./assets/canc-logo.png" width="725" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; a crafty foundation for cancelable promises">
</h1>

<p align="center">
 <a href="LICENSE">
 <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
 <a href="#contributing">
 <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome"></a>
</p>

<p align="center">
Cancelable promise ecosystem based on native <code>Promise</code>: coroutines, async iterators, decorators, utilities, third-party library helpers.
</p>

---

<!--
## Table of Contents

## Introduction
-->
## Features

* cancelable promise implementation built on top of ES Promise
* generator-based cancelable replacements for `async..await` and async iterators
* lazily evaluated cancelable promises
* cancelable Fetch API
* utility toolbox (`delay`, `timeout`, etc)
* <!--* framework helpers (Angular, Express, React, Vue)--> library helpers (Axios, Bluebird, RxJS, etc)
* decorators for TypeScript and Babel
* base packages to be used with custom promise implementation
* UMD and ESM builds for modern and legacy browsers and Node.js
* TypeScript-ready

## Packages

### Cancelable Promises

Cancellation-aware promise utilities:

<table>
 <thead>
 <tr>
 <th>Name</th>
 <th>Version</th>
 <th>Description</th>
 </tr>
 </thead>
 <tbody>
 <tr>
 <td>
 <a href="https://github.com/cancjs/canc/tree/master/packages/canc-promise">@cancjs/promise</a>
 </td>
 <td>
 <a href="https://www.npmjs.com/package/@cancjs/promise">
 <img src="https://img.shields.io/npm/v/@cancjs/promise.svg?style=flat-square" alt="Version">
 </a>
 </td>
 <td>
 Cancelable promise implementation based on ES Promise
 </td>
 </tr>
 <tr>
 <td>
 <a href="https://github.com/cancjs/canc/tree/master/packages/canc-coroutine">@cancjs/coroutine</a>
 </td>
 <td>
 <a href="https://www.npmjs.com/package/@cancjs/coroutine">
 <img src="https://img.shields.io/npm/v/@cancjs/coroutine.svg?style=flat-square" alt="Version">
 </a>
 </td>
 <td>
 Cancelable generator-based drop-in replacements for <code>async..await</code> and async iterators
 </td>
 </tr>
 <tr>
 <td>
 <a href="https://github.com/cancjs/canc/tree/master/packages/canc-fetch">@cancjs/fetch</a>
 </td>
 <td>
 <a href="https://www.npmjs.com/package/@cancjs/fetch">
 <img src="https://img.shields.io/npm/v/@cancjs/fetch.svg?style=flat-square" alt="Version">
 </a>
 </td>
 <td>
 Cross-platform Fetch API that uses cancelable promises
 </td>
 </tr>
 <tr>
 <td>
 <a href="https://github.com/cancjs/canc/tree/master/packages/canc-lazy-promise">@cancjs/lazy-promise</a>
 </td>
 <td>
 <a href="https://www.npmjs.com/package/@cancjs/lazy-promise">
 <img src="https://img.shields.io/npm/v/@cancjs/lazy-promise.svg?style=flat-square" alt="Version">
 </a>
 </td>
 <td>
 Cancelable lazily evaluated promise-like class
 </td>
 </tr>
 <tr>
 <td>
 <a href="https://github.com/cancjs/canc/tree/master/packages/canc-toolbox">@cancjs/toolbox</a>
 </td>
 <td>
 <a href="https://www.npmjs.com/package/@cancjs/toolbox">
 <img src="https://img.shields.io/npm/v/@cancjs/toolbox.svg?style=flat-square" alt="Version">
 </a>
 </td>
 <td>
 A collection of cancellation-aware promise helper functions and ponyfills
 </td>
 </tr>
 </tbody>
</table>

### Native Promises

General-purpose promise utilities that use built-in `Promise` as promise implementation where applicable:

<table>
 <thead>
 <tr>
 <th>Package</th>
 <th>Version</th>
 <th>Description</th>
 </tr>
 </thead>
 <tbody>
 <tr>
 <td>
 <a href="https://github.com/cancjs/canc/tree/master/packages/canc-coroutine-native">@cancjs/coroutine-native</a>
 </td>
 <td>
 <a href="https://www.npmjs.com/package/@cancjs/coroutine-native">
 <img src="https://img.shields.io/npm/v/@cancjs/coroutine-native.svg?style=flat-square" alt="Version">
 </a>
 </td>
 <td>
 Generator-based drop-in replacements for <code>async..await</code> and async iterators
 </td>
 </tr>
 <tr>
 <td>
 <a href="https://github.com/cancjs/canc/tree/master/packages/canc-lazy-promise-native">@cancjs/lazy-promise-native</a>
 </td>
 <td>
 <a href="https://www.npmjs.com/package/@cancjs/lazy-promise-native">
 <img src="https://img.shields.io/npm/v/@cancjs/lazy-promise-native.svg?style=flat-square" alt="Version">
 </a>
 </td>
 <td>
 Lazily evaluated promise-like class
 </td>
 </tr>
 <tr>
 <td>
 <a href="https://github.com/cancjs/canc/tree/master/packages/canc-toolbox">@cancjs/toolbox</a>
 </td>
 <td>
 <a href="https://www.npmjs.com/package/@cancjs/toolbox">
 <img src="https://img.shields.io/npm/v/@cancjs/toolbox.svg?style=flat-square" alt="Version">
 </a>
 </td>
 <td>
 A collection of promise helper functions
 </td>
 </tr>
 </tbody>
</table>

<!--
### Abstractions

Base packages that can be provided with custom promise implementation and environment-dependent global dependencies:
-->

## How It Works

Cancellation is a special form of promise rejection with cancel error that triggers registered handlers for the entire cancellation-aware promise chain.

`canc` promises implement two-way cancellation mechanism that treats promise chains as subscriptions:

* cancellation propagates down the promise chain when parent promise is canceled

* cancellation bubbles up the chain when all child promises are canceled and parent promise value is no longer consumed

Cancellation bubbling can be explicitly disabled on parent promise in case a promise causes side effects that shouldn't be implicitly discarded.

Two-way cancellation mechanism is supported for all common ways to establish a promise chain, including `all`, `race`, etc composition methods and coroutine `yield`.

A chain is cancelable only if it consists of `canc` promises. This requires to use cancellation-aware wrappers for Fetch API and third-party librararies, `async` and `async*` need to be replaced with cancelable generator-based coroutines.

## Motivation

Promise cancellation is highly beneficial in real life scenarios yet it's not a part of existing ECMAScript specification. JavaScript API like Fetch `AbortController` use their own mechanisms that aren't unified with native promises.

<!-- applies to frontend and backend development -->

A situation that is common in modern JavaScript applications is that a process like network request that stands behind long-running asynchronous task is abortable, consumers need to unsubscribe from results and abort initial process when it's no longer needed. This eventually becomes harder with uncancelable promises when a task is composed of smaller independent tasks.

See [examples](#examples) for more use cases.

<!--
### Frontend Use Cases

* Long-running promise tasks cannot be easily disposed on route navigation cancel or component destroy
* Angular doesn't support change detection inside native `async`
* React; this is handled with state management with side effects like Redux Saga
-->

### Background

* **No official solution**. [Native cancelable promises](https://github.com/tc39/proposal-cancelable-promises) were incompatible with ES6 promise semantics, provided one-way cancellation, used unwieldy cancel tokens and have been abandoned.

* **Bluebird stepped aside**. Bluebird has bulky stable API and has been largely superseded by ES promises where applicable, particularly due to `async..await`. [Two-way cancellation](http://bluebirdjs.com/docs/api/cancellation.html) is disabled by default and incompatible with native promise semantics.

* **No universal third-party options**. JavaScript community provides no comprehensive alternatives based on native promises. Renowned `p-*` [package collection](https://github.com/sindresorhus/promise-fun#packages) only supports one-way cancellation and targets Node.js.

* **Observables aren't a magic bullet**. Observables can provide a superset of promise features, as well as cancellation. However, observables don't offer expressive sugar similar to `async..await`, cancellation may be lost in promise interop. Observables are push-based and cannot displace pull-based `async*` async iterators. [RxJS](https://github.com/ReactiveX/rxjs) is commonly used implementation with complex API, no [native observable](https://github.com/tc39/proposal-observable) implementation exists yet.

### Comparison

| | `canc` | native + `AbortController` | [p-cancelable](https://github.com/sindresorhus/p-cancelable) | [alkemics/CancelablePromise](https://github.com/alkemics/CancelablePromise) | [c-promise2](https://github.com/DigitalBrainJS/c-promise) | [Bluebird](http://bluebirdjs.com/docs/api/cancellation.html) |
|---|---|---|---|---|---|---|
| Native `Promise` subclass | yes | n/a | no (wraps) | no (wraps) | no (wraps) | no (own implementation) |
| Deep (chain-wide) cancellation | yes | manual (thread signal yourself) | no (single promise) | no (single promise) | yes | yes |
| Rejection-based (normal try/catch) | yes | yes (`AbortError`) | yes | no (silent skip) | no (never settles) | no (never settles by default) |
| Two-way propagation (bubble up + flow down) | yes | no | no | no | no | no |
| `AbortSignal` interop | yes (`@cancjs/fetch`, toolbox helpers) | native | no | no | no | no |
| Actively maintained | yes | n/a (platform) | yes | no | no | no (cancellation feature frozen) |

`canc` is the only entry that combines a native `Promise` subclass with deep, two-way,
rejection-based cancellation. `AbortController` is the maintained platform primitive but only
threads a signal, it doesn't propagate cancellation through a chain on its own. The `p-*`-style
packages and alkemics wrap a single promise and skip silently instead of rejecting. c-promise2 has
deep cancellation but isn't a `Promise` subclass and has gone quiet. Bluebird's two-way
cancellation predates today's `async..await`-centric ecosystem, is off by default, and promises
never settle on cancel instead of rejecting.

## Performance

`canc` wraps every `Promise` operation in cancellation bookkeeping, and that costs something.
Full numbers (methodology, machine specs, per-suite breakdowns, browser-lane results) live in
[`docs/benchmarks.md`](docs/benchmarks.md); the short version:

In a simulated request waterfall (5 sequential + 3 parallel requests, 30% canceled mid-flight),
`canc` runs well under a microsecond slower per request than a hand-rolled native `Promise` +
`AbortController` baseline, a relative tax that has ranged from roughly 20% to 80% across repeated runs depending on machine
load, typically landing in the 25-50% band, that is
dwarfed by any real network or timer latency. **For I/O-bound flows (the common case), this
overhead is negligible.** A fraction of a microsecond of bookkeeping disappears next to a request
that takes milliseconds. The cost shows up more in tight, cancellation-heavy loops (a
mount/unmount-cancel component lifecycle simulation runs several times slower than native) and in
raw construct/chain throughput under isolated microbenchmarks, where `canc` lands roughly one order
of magnitude behind native `Promise` and is mixed against Bluebird depending on the shape of the
chain. Combinator internals (`all`/`race`/`any`/`allSettled`) were reworked to skip an extra
per-item allocation; the measured effect ranges from a modest win to roughly noise-level depending
on the case and run (see `docs/benchmarks.md`), and combinators remain well short of native and
mixed against Bluebird.

Memory follows the same pattern. A single `canc` promise costs a few hundred bytes more than a
native one. For high-concurrency workloads (thousands of promises in flight at once, long-lived
subscriptions, or streaming/pagination patterns that keep many chains alive), budget roughly an
extra 2 MB of retained heap per 1,000 in-flight promises versus native. If a workload creates and
discards promises faster than it can await them, this is the number to watch.

None of this changes the tradeoff to make in a given app: `canc` gives you real, rejection-based,
two-way cancellation without hand-wiring `AbortController` through every call site. Where that's
worth a few hundred bytes and a low single-digit-microsecond tax per operation, it's worth using;
where a hot loop constructs and cancels promises far faster than any I/O it wraps, measure against
your own budget first.

<!--
## Getting Started

### Installation

### Usage

## Documentation
-->

## Compatibility

Packages rely on following ECMAScript 2015+ features: `Symbol` (ES2018 for async iterators), `Reflect`, `Promise` (ES2018 for `finally`, ES2020 for `allSettled`), `Object.assign`, `Object.setPrototypeOf`.

### TypeScript

TypeScript floor is 4.2. Each package ships two `.d.ts` variants and resolves the right one
automatically, no consumer configuration needed. TS >= 4.7 reads `exports["."].types` and gets
`dist/types/*.d.ts`. Older TS falls back to `typesVersions` (pre-4.7 resolvers don't read
`exports.types`) and gets `dist/types-ts4.2/*.d.ts`.

The `-ts4.2` variant is produced from the standard output via `downlevel-dts`, plus a follow-up
patch for `Awaited<T>` which predates `downlevel-dts`'s own transform coverage. Verified against
a pinned matrix (TS 4.2 / 4.7 / 5.0 / 5.4 / latest) by compiling fixture projects against the
built tarballs.

### Build targets

All four build outputs (CJS, ESM, UMD, minified UMD) compile from the same ES5-targeted
TypeScript source, only the module wrapper differs. CJS is `dist/index.cjs` (`main` field), ESM
is `dist/index.mjs` (`module` field), UMD is `dist/index.umd.js` and `dist/index.umd.min.js`
(`<script>`/AMD/CommonJS fallback, `unpkg`/`jsdelivr` fields). `downlevelIteration` is on; no
`class`, `#private`, bigint, or `WeakRef` in core source.

### Engines

`node >= 18` per package `engines` field. That's the tested and supported Node.js baseline, not
a hard floor imposed by the ES5 output itself, the compiled code runs on much older engines too.

### Alternative engines (QuickJS, XS/Moddable, Hermes)

Not part of the tested CI matrix, but source targets ES5 with guarded ES2018+ feature use
(`AggregateError` etc), so it should work in principle.

* **QuickJS** - spec-compliant ES2020 engine; expected to work with native `Promise`/`Reflect`,
 no known incompatibilities.
* **XS (Moddable)** - targets ES2023 with some omissions on constrained builds; verify `Reflect`
 and `Promise.allSettled` availability for your build profile before relying on bubbling behavior.
* **Hermes** (React Native) - ships its own `Promise` polyfill (bytecode-compiled, not a native
 spec-engine `Promise`). Species (`Symbol.species`) and microtask-ordering quirks are the usual
 hazard surface on polyfilled `Promise`, so treat those code paths as the risk area if you rely
 on Hermes.

None of the above are covered by the TS version matrix or CI; treat as best-effort.

### Native Support

Tested and supported: Node.js 18+ (CI matrix runs 18.x and 20.x on Linux and Windows), and current
evergreen browsers with native `Symbol`, `Reflect`, `Promise` (including `finally`/`allSettled`),
`Object.assign`, `Object.setPrototypeOf`.

The compiled output targets ES5 (see [Build targets](#build-targets)), so it runs on older engines
too, but only the Node 18+ / evergreen-browser baseline above is covered by CI.

### Legacy / Polyfilled Support

Older browser and Node.js targets (IE11, Node 6, polyfilled ES5 via `core-js`/`polyfill.io`, and
similar) are not part of the current test matrix or package set. That support is planned for
future `-legacy` package entries rather than claimed here; see the package list above.

## Examples

Runnable examples live in [examples](https://github.com/cancjs/canc/tree/master/examples), a separate npm install root with its own README.

<!--
### Component with uncancelable promises:

```js
class Component {
 createHook() {
 fetchFooBar();
 }

 async fetchFooBar() {
 let foo = await fetchFoo();

 // safeguard
 if (this._destroyed)
 return;

 // the framework causes an error if the instance has been destroyed
 this.updateState({ foo });

 // cannot be stopped even if the result isn't needed
 let bar = await fetchBar({ foo, retries: 10 });

 // safeguard
 if (this._destroyed)
 return;

 this.updateState({ bar });
 }

 destroyHook() {
 this._destroyed = true;
 }
}
```


```js
class Component {
 createHook() {
 fetchFooBarBaz();
 }

 async fetchFooBarBaz() {
 // retries cannot be stopped even if they aren't usable
 let one = await fetchFoo({ retryTimes: 5});
 if (this._destroyed) return;
 this.updateState({ one });
 let two = await actionTwo(one);
 if (this._destroyed) return;
 this.updateState({ one });
 }

 destroyHook() {
 this._destroyed = true;
 }
}
```
-->

<!--
## Related

## Status
-->



## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](LICENSE)