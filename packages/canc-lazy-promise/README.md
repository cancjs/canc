<p align="center">
	<img src="../../assets/canc-logo.png" width="483" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; a crafty foundation for cancelable promises">
</p>

<h1 align="center">@cancjs/lazy-promise</h1>

<p align="center">
Cancelable lazily evaluated promise-like class.
</p>

---

## Introduction

A lazily evaluated, cancelable promise-like. The executor is deferred until the value is first
subscribed with `then`, `catch`, `finally` or `await`. Canceling before the first subscription
means the executor never runs at all. The result is cached: multiple subscribers share a single
execution, and the settled value is reused.

Unlike an observable, a lazy promise stays a plain awaitable with standard microtask ordering.
Unlike an eager `Promise`, nothing happens until someone actually wants the value.

## Features

* the executor runs on first subscription, not on construction
* canceling before that skips the work entirely, canceling later tears it down
* single execution shared by every subscriber
* optional reset, so an abandoned value can be produced again later
* the promise implementation is pluggable

## Getting Started

### Installation

```sh
npm install @cancjs/lazy-promise @cancjs/promise
```

`@cancjs/promise` is a peer dependency.

### Usage

```js
import { lazy } from '@cancjs/lazy-promise';

const value = lazy((resolve, reject, handleCancel) => {
	const timerId = setTimeout(() => resolve('done'), 1000);
	handleCancel(() => clearTimeout(timerId));
});

// The timer has not started yet.
const result = await value; // runs the executor now
```

The executor may return a teardown function instead of, or in addition to, calling `handleCancel`:

```js
const feed = lazy((resolve, reject) => {
	const socket = openFeedSocket();
	socket.onData(resolve);
	socket.onError(reject);

	return () => socket.close();
});

feed.cancel(); // teardown runs, socket closed, result discarded
```

Canceling before the first subscription skips the executor entirely:

```js
const report = lazy(buildExpensiveReport);

report.cancel(); // buildExpensiveReport never runs
await report; // rejects with CancelError
```

## How It Works

Construction only stores the executor. The first `then`, `catch`, `finally` or `await` starts it
and creates the underlying promise, which is a [`CancelablePromise`](../canc-promise) unless
another implementation is supplied. Every later subscriber attaches to that same execution.

Cancellation has two shapes depending on when it arrives. Before the first subscription there is
nothing to stop, so the executor is skipped and the value rejects with a `CancelError` as soon as
anyone subscribes. After it, the underlying promise is canceled and the registered teardown runs.

## Description

### Resettable values

By default a lazy promise executes at most once and caches whatever it settled with, including a
cancellation. With `{ resettable: true }`, if every consumer cancels before the value settles, the
teardown runs and the lazy returns to its unstarted state, so a later subscription runs the
executor again:

```js
const feed = lazy(subscribeToFeed, { resettable: true });
```

This is the shape for a shared subscription that should live exactly as long as it has consumers,
for example a socket that reconnects when a component mounts again.

### Choosing the promise implementation

Precedence, highest first: a per-call `options.impl`, the `CancelableLazyPromise.PromiseImpl`
static, the app-wide registry from
[`@cancjs/promise`](../canc-promise#pluggable-implementation), then the built-in
`CancelablePromise`.

```js
lazy(work, { impl: MyPromise });
```

The remaining options are [`CancelablePromise` options](../canc-promise#options) and are passed
through to the underlying promise.

### It is a thenable, not a Promise

`CancelableLazyPromise` is promise-like rather than a `Promise` subclass, because subscribing is
the thing that starts it. It behaves like a promise for `await` and for `then` chains, but
tooling that only recognizes real promises may not see it. In particular
`@typescript-eslint/no-floating-promises` needs `checkThenables` to report an unconsumed lazy
value, and an unconsumed lazy value is worse than a floating promise: the work never even starts.

### Native twin

For laziness without cancellation, see
[`@cancjs/lazy-promise-native`](../canc-lazy-promise-native), which backs the value with a plain
`Promise`.

## API

`lazy(executor, options?)` returns a `CancelableLazyPromise` and is also the default export.
`new CancelableLazyPromise(executor, options?)` is the class form.

The executor is `(resolve, reject, handleCancel) => void | (() => void)`, where the optional
return value is a teardown function.

Instance: `then`, `catch`, `finally`, `cancel(reason?)`.

Options: `resettable`, `impl`, plus [`CancelablePromise` options](../canc-promise#options).
Class static: `CancelableLazyPromise.PromiseImpl`.

## Compatibility

Node.js 18 and later, current browsers, TypeScript 4.2 and later. Everything else follows
[`@cancjs/promise`](../canc-promise#compatibility).

## Documentation

* [`@cancjs/promise`](../canc-promise) for the cancellation model
* [`@cancjs/fetch`](../canc-fetch) whose `lazy` entry point returns lazy requests
* [examples](../../examples): `demo-lazy-promise` for lazy start, shared consumers and reset

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](../../LICENSE)
