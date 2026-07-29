<div align="center">
	<img src="https://raw.githubusercontent.com/cancjs/canc/master/assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<h1 align="center">@cancjs/toolbox</h1>

<p align="center">
Helper functions and adapters for cancellation-aware code.
</p>

---

## Introduction

Two kinds of helpers live here. The first kind is the usual promise utility set, `delay`,
`timeout`, `retry`, `waitFor` and friends, built so that canceling the result also stops what the
helper started: the timer is cleared, the pending attempt is canceled, the polling stops.

The second kind is more important in practice. `cancelify` and `promisify` turn an existing API
into a cancelable one, once, at the boundary. After that the application code stops passing
signals around, because canceling a promise reaches the underlying request on its own.

## Features

* timing and control helpers that clean up after themselves on cancellation
* adapters that make signal-aware and callback-style APIs return cancelable promises
* `AbortSignal` interop in both directions, including timeout composition
* deliberate ways to end a cancelable flow instead of blanket error swallowing
* every helper accepts
	[`CancelablePromise` options](https://github.com/cancjs/canc/tree/master/packages/canc-promise#options)

## Getting Started

### Installation

```sh
npm install @cancjs/toolbox @cancjs/promise
```

`@cancjs/promise` is a peer dependency.

### Usage

```js
import { delay, timeout, retry } from '@cancjs/toolbox';

const undoWindow = delay(5000);
undoWindow.then(sendEmail);

// The user pressed undo. The timer is cleared, the email is never sent.
undoWindow.cancel();
```

```js
const quotes = timeout(fetchQuotes(), 3000);
// On timeout the request itself is canceled, not just abandoned.
```

Wrapping an API that takes a signal is a one-liner, and callers never see the signal again:

```js
import { cancelify } from '@cancjs/toolbox';

const searchFlights = cancelify(({ getSignal }, [query]) =>
	flightApi.search(query, getSignal()),
);

const search = searchFlights('LIS');
search.cancel(); // the underlying request is aborted
```

## How It Works

Helpers build their result through the resolved promise implementation, which is
`CancelablePromise` unless something else is registered (see
[pluggable implementation](https://github.com/cancjs/canc/tree/master/packages/canc-promise#pluggable-implementation)).
That is what makes the cleanup possible: `delay` registers a cancel handler that clears its timer,
`retry` cancels the attempt in flight and drops the backoff wait, `waitFor` stops polling,
`timeout` cancels the promise it was watching once the deadline wins.

`cancelify` works from the other end. It hands the wrapped function a lazy signal thunk. The
controller is created on the first `getSignal()` call and aborted when the returned promise is
canceled, so a function that never asks for a signal allocates nothing.

## Description

### Adapters

Adapting an API is the same discipline as promisifying one. Do it once, at the boundary, and keep
the application code free of the mechanism:

```js
const orderApi = {
	list: cancelify(({ getSignal }, [filter]) => rawOrderApi.list(filter, { signal: getSignal() })),
	get: cancelify(({ getSignal }, [id]) => rawOrderApi.get(id, { signal: getSignal() })),
};
```

`getSignal()` can be placed anywhere the underlying call wants it, not only in a trailing options
object.

For callback-style APIs use `promisify`, which covers error-first and value-first callbacks,
multiple callback values, and the `nodejs.util.promisify.custom` hook. `promisifyAll` applies it
across an object, with include and exclude patterns and a choice of cloning, merging or
overwriting.

What not to do: build a `new CancelablePromise` around a controller and a call, per call site.
That is the promise constructor antipattern in cancelable clothing. Wrap once, compose after.

### Signal interop

`toAbortSignal(promise)` derives a signal that aborts when the promise is canceled or otherwise
rejects, for handing cancelable work to an API that only speaks `AbortSignal`.

`withSignal(signal, promiseOrFn)` is the inverse convenience: it races work against an incoming
signal, and passes the value through unraced when the signal is `undefined`, so optional
cancellation does not need a branch at every call site.

`interopTimeout(promise, ms, signal?)` combines an external signal with a deadline in one race and
cancels the underlying promise whichever wins.

`createAbortSignal()` mints a plain controller and returns its signal with a bound `abort`. For a
signal that aborts with a `CancelError` rather than a bare `DOMException`, use
`createCancelSignal` from
[`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#abortsignal-interop).

### Ending a flow

`suppress(promise)` resolves to `undefined` when the promise is canceled and rethrows everything
else, which is the honest version of a blanket catch. `suppressAbort(promise)` also swallows a
plain `AbortError`, and `suppress(promise, { abort: true })` is the same thing spelled out.

```js
} finally {
	await suppress(uploadInProgress);
}
```

### Retry and polling

`retry` takes a function of the attempt number, so the attempt itself can vary, and backs off
exponentially between attempts (`retries`, `minTimeout`, `factor`, `maxTimeout`, `onRetry`).
Canceling stops both the wait and the attempt in flight.

`waitFor` polls a condition (`interval`, `timeout`). An async condition is awaited before the next
poll is scheduled, so slow checks never overlap.

### Lazy async iterator helpers

Pipeable operators for cancelable async iterables are planned as the `@cancjs/toolbox/async-iter`
entry point 🚧. Until it lands, consume and produce async iterables with `canc.forAwait` and
`cancGen.async` from
[`@cancjs/coroutine`](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine).

## API

Every helper takes
[`CancelablePromise` options](https://github.com/cancjs/canc/tree/master/packages/canc-promise#options)
as its last argument.

### Timing

| Export | Description |
|---|---|
| `delay(ms, value?, options?)` | Resolves with `value` after `ms`, cancel clears the timer |
| `timeout(promise, ms?, options?)` | Rejects with `TimeoutError` after `ms` and cancels the promise |
| `minDelay(promise, ms, options?)` | Settles no earlier than `ms`, for flicker-free loading states |
| `waitFor(condition, options?)` | Resolves once `condition` is truthy, polling at `interval` |

### Control

| Export | Description |
|---|---|
| `retry(input, options?)` | Retries with exponential backoff, `input` receives the attempt number |
| `deferCancelable(options?)` | A deferred whose `promise` is cancelable |

### Adapters

| Export | Description |
|---|---|
| `cancelify(fn, options?)` | Wraps a promise-returning fn, giving it a signal that aborts on cancel |
| `promisify(fn, options?)` | Wraps a callback-style fn into one returning a cancelable promise |
| `promisifyAll(source, options?)` | Applies `promisify` across an object's methods |

### Signal interop

| Export | Description |
|---|---|
| `toAbortSignal(promise)` | Signal that aborts when the promise cancels or rejects |
| `withSignal(signal, promiseOrFn)` | Races work against a signal, passes through when there is none |
| `interopTimeout(promise, ms, signal?, options?)` | External signal and deadline in one race |
| `createAbortSignal()` | Plain `AbortController` convenience, returns `{ signal, abort }` |
| `suppress(promise, options?)` | Swallows a cancellation, rethrows everything else |
| `suppressAbort(promise, options?)` | Swallows a cancellation and a plain abort |

### Errors

`AbortError`, `isAbortError(error)`, `TimeoutError`, `isTimeoutError(error)`.

## Compatibility

Node.js 18 and later, current browsers, TypeScript 4.2 and later. `AbortController` and
`AbortSignal` are required by the signal interop helpers, and `interopTimeout` uses
`AbortSignal.any`. Everything else follows
[`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

For the same helpers on plain `Promise`, without cancellation, see
[`@cancjs/toolbox-native`](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox-native).

## Documentation

* [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for the
	cancellation model and options
* [Coroutines](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine) for using
	these helpers inside a cancelable flow
* [Examples](https://github.com/cancjs/canc/tree/master/examples): `demo-toolbox` for the
	helpers under cancellation, `demo-signal-interop` for the bridges

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](../../LICENSE)
