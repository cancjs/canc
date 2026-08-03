<div align="center">
  <img src="https://raw.githubusercontent.com/cancjs/canc/master/assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<h1 align="center">@cancjs/promise</h1>

<p align="center">
Cancelable promise implementation based on native <code>Promise</code>.
</p>

---

## Introduction

`CancelablePromise` is a `Promise` with a `cancel()` method. It is built on the native
implementation, so it settles at the same microtask timing, works with `await`, and can be handed
to any code that expects a promise.

Cancellation is a rejection with a `CancelError`, not a silent skip and not a promise that never
settles. Regular `try`/`catch` and `.catch()` keep working, and code that does not care about
cancellation does not need to know it happened.

This package is the foundation of the `canc` ecosystem. On its own it covers the promise layer:
cancelable chains, two-way propagation, combinators, cleanup. The rest of the ecosystem builds on
it: [coroutines](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine) replace
`async`/`await` with generator functions that cancel at every yield point, the
[toolbox](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox) adds timing helpers,
adapters and signal interop,
[fetch](https://github.com/cancjs/canc/tree/master/packages/canc-fetch) wraps the Fetch API, and
[decorators](https://github.com/cancjs/canc/tree/master/packages/canc-decorators) bring cancelable
coroutines to class methods. See the
[repository](https://github.com/cancjs/canc) for the full ecosystem.

## Features

- cancelable promise built on top of native ES `Promise`
- cancellation is a special rejection (`CancelError`), normal `try`/`catch`/`.then`/`.catch`
  semantics preserved
- two-way cancellation: propagates down the chain, bubbles back up when every consumer has
  canceled and the value is unconsumed
- combinators that cancel the promises whose results are no longer needed
- `AbortSignal` interop in both directions
- explicit resource management through `using` and `await using`
- no dependencies

## Getting Started

### Installation

```sh
npm install @cancjs/promise
```

This package is core tier: it follows strict semver, so the default caret pin, `^1`, is safe. See
[Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md) for the full policy.

### Usage

The executor receives a context object for registering cleanup and obtaining a signal. Cleanup
runs when the promise is canceled:

```js
import { CancelablePromise, isCancelError } from '@cancjs/promise';

const delayed = new CancelablePromise((resolve, reject, { handleCancel }) => {
  const timerId = setTimeout(resolve, 1000, 'done');
  handleCancel(() => clearTimeout(timerId));
});

delayed
  .then((value) => console.log(value))
  .catch((err) => {
    if (isCancelError(err)) {
      console.log('canceled');
      return;
    }

    throw err;
  });

delayed.cancel();
```

Cancellation applies to the whole chain, not to a single promise:

```js
const report = loadOrders()
  .then((orders) => buildReport(orders))
  .then((rendered) => render(rendered));

// Cancels the request, the report build, and the render step.
report.cancel();
```

Combinators keep the same behavior, and they stop the work whose result nobody will read:

```js
const fastest = CancelablePromise.race([fetchPrimary(), fetchMirror()]);
// When one wins, the other is canceled instead of running to completion.
```

For most real tasks, you rarely need to write `new CancelablePromise` directly.
[`cancelify` and `promisify`](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox#adapters)
wrap existing APIs into cancelable ones at the boundary, so the rest of your code works with
plain cancellation without managing signals or constructors.

## How It Works

### Cancellation is a rejection

`cancel(reason)` rejects the promise with a `CancelError`. The reason is normalized: a
`CancelError` passes through unchanged, any other object becomes its `cause`, a string becomes its
message. Handlers registered through `handleCancel` still receive the original reason.

Because it is an ordinary rejection, a canceled promise that nobody handles triggers
`unhandledRejection` like any other. That is intentional. Suppress it deliberately with
`suppressCancel` or a global handler, not with a blanket `.catch(() => {})`.

### Down the chain

Canceling a promise cancels everything derived from it. The pending step rejects with the
`CancelError`, every step after it is skipped, and the registered cancel handlers of the canceled
node run so in-flight work can be torn down.

Down-propagation cannot be intercepted. If an upstream promise is canceled, a downstream promise
adopts that rejection, the same way it would adopt any other rejection. This is native `Promise`
behavior, and breaking it would break `try`/`catch`.

### Up the chain

A promise chain is treated as a subscription. Each derived promise counts as a consumer of its
parent. When every consumer has been canceled and the parent's value is no longer wanted, the
parent cancels itself and its own cleanup runs, so the original request does not keep going for
nobody.

Bubbling is on by default. Turn it off per promise with `bubble: false` when the work has side
effects that should not be discarded implicitly, for example a write that must complete once
started.

### Combinators

`race` and `any` cancel the losers once a winner settles. `all` cancels the remaining inputs on
the first rejection. `allSettled` cancels nothing, by definition it waits for everything. Inputs
constructed with `bubble: false` are never canceled by this mechanism.

Canceling a combinator result does not cascade into its inputs, because an input may be shared
with another consumer.

### Disposal

A pending promise cancels itself when it leaves a `using` or `await using` scope. The async form
waits for the cancel handlers to settle, so cleanup finishes before the scope exits. Disposing an
already settled promise, or a shielded one, is a no-op rather than an error.

```js
async function loadReport(id) {
  await using request = fetchReport(id);
  return await request;
  // Leaving the scope early, by return or by throw, cancels a request still in flight.
}
```

### Coroutines

A cancelable promise chain is cancelable, but `async`/`await` functions are not, because `await`
does not pass control back in a way that can be interrupted.
[Coroutines](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine) solve this with
generator functions that cancel at every `yield*` point, making deep cancelable flows practical
without manual chaining.

## Description

### Options

Every option is accepted by the constructor and by the statics, and the current values are
readable through the `options` getter.

| Option            | Default | Meaning                                                                                     |
| ----------------- | ------- | ------------------------------------------------------------------------------------------- |
| `bubble`          | `true`  | Cancellation bubbles to the parent when all consumers are canceled                          |
| `asyncCancel`     | `true`  | `cancel()` settles failing cancel handlers asynchronously instead of throwing               |
| `forceCancelable` | `true`  | The result stays cancelable even when the executor resolves with another promise            |
| `strict`          | `false` | Throws on cancellation problems instead of ignoring them                                    |
| `shield`          | `false` | Protects this promise's own work from cancellation coming from below or outside             |
| `signal`          | none    | Cancels the promise when the signal aborts. One `AbortSignal` or an array, first abort wins |

`shield` is an upward and self shield only. A direct `cancel()` becomes a no-op and a bubble
arriving from canceled children stops there, but a canceled or rejected upstream still propagates
down into a shielded promise. It is per promise and is not inherited by `then`-derived children.

Flags are also exposed as writable properties (`promise.bubble = false`), and the class-wide
defaults live in `CancelablePromise.defaultOptions`.

### Detecting cancellation

Use the exported guards. They are brand-based, so they keep working across realms and across two
copies of the package in one dependency tree, which `instanceof` does not:

```js
import { isCancelError, isCancPromise, isAbortError, isTimeoutError, isAggregateError } from '@cancjs/promise';
```

`isCancelError` matches the brand only: a foreign error merely named `CancelError` is never
treated as one. `isAbortError`, `isTimeoutError` and `isAggregateError` also fall back to
`error.name`, because the platform produces those errors (`fetch`, `AbortSignal.timeout()`, the
builtin `AggregateError`) and there is no canc-owned producer of them to brand.

A promise canceled through an `AbortSignal` rejects with a `CancelError` whose `cause` is the
abort reason, not with a `DOMException`. Check `err.aborted`, or `err.timedOut` when the signal
came from `AbortSignal.timeout()`, on the `CancelError` when the difference matters. `isAbortError`
and `isTimeoutError` are for raw signal-driven code with no canc promise in between.

`CancelError` also carries `bubbled` (the cancellation came from the consumer side) and `disposed`
(it came from leaving a `using` scope).

The underlying `Symbol.for` brand symbols are exported as `CANCEL_ERROR_BRAND` (`Symbol.for('@cancjs/promise:CancelError')`), `CANCEL_PROMISE_BRAND` (`Symbol.for('@cancjs/promise:CancelablePromise')`), and `CANCEL_SIGNAL_BRAND` (`Symbol.for('@cancjs/promise:CancelSignal')`).

### Ending a cancelable flow

At the boundary where a flow is consumed, cancellation is usually an expected outcome rather than
an error. Two helpers say so explicitly:

```js
const outcome = await catchCancel(searchProducts(query));

if (isCancelError(outcome)) {
  showStatus('Search canceled');
  return;
}

render(outcome);
```

`suppressCancel(promise)` is the shorter form when the reason does not matter: it resolves to
`undefined` on cancellation and rethrows everything else. Both take `{ abort: true }` to also
treat a bare `AbortError` as an expected stop, and `{ timeout: true }` to do the same for a bare
`TimeoutError`.

For a fixed set of expected errors, compile the check once:

```js
const suppressExpected = createSuppressError(CancelError, isAbortError, isTimeoutError, 'RetryError');

await suppressExpected(searchProducts(query));
```

A matcher is a class (matched by instance, brand, or name), a predicate, or an error name string.
`createCatchError` is the counterpart that hands the matched error back instead of dropping it.

### AbortSignal interop

Pass an existing signal to have it cancel the promise. The listener is removed when the promise
settles, an already aborted signal cancels immediately, and an array composes several sources with
first abort winning:

```js
const quotes = new CancelablePromise(executor, {
  signal: [userSignal, AbortSignal.timeout(5000)],
});
```

Inside the executor, `getSignal()` returns an `AbortSignal` that aborts when the promise is
canceled, so signal-aware APIs can be connected directly:

```js
const data = new CancelablePromise((resolve, reject, { getSignal }) => {
  fetch('/api/data', { signal: getSignal() }).then(resolve, reject);
});
```

For the other direction, `createCancelSignal()` mints a signal that aborts with a `CancelError`,
so downstream code that only speaks `AbortSignal` still sees a genuine cancellation. The
[toolbox](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox) has the higher-level
wrappers, including `cancelify` and `toAbortSignal`.

### Awaiting cleanup

By default `cancel()` returns a promise that settles once every cancel handler has settled, so
cleanup can be awaited when it matters:

```js
await checkout.cancel();
```

Handlers start synchronously the moment the cancel takes effect, whatever triggered it. Only
waiting for their results is asynchronous. With `asyncCancel: false` handlers run synchronously
and `cancel()` returns nothing.

### Adopting a foreign promise

`makeCancelable(promise)` wraps an existing promise so the chain around it is cancelable. If the
wrapped promise has its own `cancel()` method, for example a Bluebird or p-cancelable promise,
canceling the wrapper calls through to it. If the wrapped promise is plain, canceling stops the
chain from continuing but the underlying operation runs to completion. To add cancellation to a
plain-promise API at its source, use
[`cancelify` or `promisify`](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox#adapters)
from the toolbox.

### Pluggable implementation

Ecosystem packages (toolbox, coroutine) pick which promise implementation to build on through a
small registry exported here. Register one implementation at app startup and every consumer that
has no more specific override uses it:

```js
import { setPromiseImpl, getPromiseImpl } from '@cancjs/promise';

setPromiseImpl(MyPromiseImpl); // default is CancelablePromise
getPromiseImpl(); // MyPromiseImpl
setPromiseImpl(); // clears the registration, back to CancelablePromise
```

Consumers resolve the implementation for each call in this order, highest first: a per-call
`options.impl`, then the consumer's own class static, then this registry, then the built-in
`CancelablePromise`. Per-call and static injection pass the implementation by reference, so they
always work. The registry is the convenience layer for the common case where one implementation
applies process-wide.

#### Troubleshooting: registration seems to be ignored

The registry is module state in this package. It works app-wide because ecosystem packages declare
`@cancjs/promise` as a `peerDependency`, so the package manager installs a single shared copy. If
two different versions end up in the same dependency tree, each carries its own registry: a
`setPromiseImpl` call made through one copy is invisible to code reading through the other, and
the second copy silently falls back to its built-in default.

Symptoms: `setPromiseImpl` runs without error but a consumer still uses `CancelablePromise`, or
`getPromiseImpl()` returns a different value than the one that was set.

Fixes: keep `@cancjs/promise` deduplicated to one version, and run `npm ls @cancjs/promise` to
confirm a single copy. When a single copy cannot be guaranteed, pass the implementation through
per-call options or a class static instead of relying on the registry.

## API

### `CancelablePromise`

`new CancelablePromise(executor, options?)`, where `executor` is
`(resolve, reject, context) => void`. The context object provides `handleCancel` for registering
cleanup and `getSignal` for obtaining an `AbortSignal` tied to the promise. Also the default
export.

Statics, each taking an optional trailing options argument: `all`, `allSettled`, `any`, `race`,
`resolve`, `reject`, `withResolvers`, `try`. The options configure the promise the static returns,
and combinator inputs are adopted with them.

Instance methods: `then`, `catch`, `finally`, `handleCancel(onCancel, options?)`,
`cancel(reason?)`, `[Symbol.dispose]`, `[Symbol.asyncDispose]`.

`handleCancel` registers cleanup outside the executor and returns the promise, so it chains.
With `{ immediate: true }` the handler also fires when the promise is already canceled at
registration time.

Instance getters: `canceled`, `cancelable`, `options`. The flags `bubble`, `asyncCancel`,
`forceCancelable`, `strict` and `shield` are readable and writable.

Class-wide defaults: `CancelablePromise.defaultOptions`.

### `CancelError`

`new CancelError(reason?, { cause })`. Properties: `name`, `message`, `cause`, `bubbled`,
`disposed`, and the `aborted` and `timedOut` getters, true when the cause is an abort or a
timeout respectively.

### Helpers

`isCancelError(error)`, `isCancPromise(value)`, `isAbortError(error)`, `isTimeoutError(error)`,
`isAggregateError(error)`, `isCancelSignal(value)`, `catchCancel(promiseOrError, options?)`,
`suppressCancel(promiseOrError, options?)`, `createSuppressError(...matchers)`,
`createCatchError(...matchers)`, `makeCancelable(promise, options?)`, `createCancelSignal(reason?)`.

`catchCancel` and `suppressCancel` take `{ abort: true }` to also match a plain abort and
`{ timeout: true }` to also match a plain timeout; both accept either a promise or a caught error.

`AbortError`, `TimeoutError` and `AggregateError` are the error classes behind those cases (the
platform's own DOMException-based versions where the platform produces one, a matching class
otherwise). Pass them to `createSuppressError` / `createCatchError`, or check `error.name`
directly.

### Implementation registry

`setPromiseImpl(impl?)`, `getPromiseImpl()`, `resolvePromiseImpl(options?, staticImpl?)`.

## Compatibility

`CancelablePromise` implements `Promise` methods up to ES2026 and needs only an ES2015-compliant
`Promise` to work correctly. No method polyfills are necessary in older environments. Signal
interop (`signal` option, `createCancelSignal`) additionally requires a spec-compliant
`AbortController`.

Node.js 18 and later is the tested and supported baseline, declared in `engines`. Current browsers
are supported out of the box. TypeScript 4.2 and later. Two type variants ship and the right one
is selected automatically.

Four builds are produced from the same ES5-targeted source, only the module wrapper differs:
`dist/index.cjs` for `require`, `dist/index.mjs` for `import` and bundlers, `dist/index.umd.js`
and `dist/index.umd.min.js` for `<script>` tags and CDNs.

Because the output is ES5, it also runs on engines outside the test matrix, including embedded
ones such as QuickJS, XS and Hermes.

## Documentation

- [Coroutines](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine) for the
  `async`/`await` replacement built on this package
- [Toolbox](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox) for timing helpers,
  adapters and signal interop
- [Fetch](https://github.com/cancjs/canc/tree/master/packages/canc-fetch) for cancelable requests
- [Examples](https://github.com/cancjs/canc/tree/master/examples) for runnable projects, starting
  with `demo-promise-basics` and `demo-chain-propagation`
- [Repository](https://github.com/cancjs/canc) for the ecosystem overview

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](./LICENSE)
