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

- timing and control helpers that clean up after themselves on cancellation
- adapters that make signal-aware and callback-style APIs return cancelable promises
- `AbortSignal` interop in both directions, including timeout composition
- deliberate ways to end a cancelable flow instead of blanket error swallowing
- every helper accepts
  [`CancelablePromise` options](https://github.com/cancjs/canc/tree/master/packages/canc-promise#options)

## Getting Started

### Installation

```sh
npm install @cancjs/toolbox @cancjs/promise
```

`@cancjs/promise` is a peer dependency. This package is ecosystem tier: a minor release can carry
a breaking change, so pin it with a tilde, `~1.x`, rather than the default caret. See
[Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md) for the full policy.

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
  list: cancelify(({ getSignal }, [filter]) =>
    rawOrderApi.list(filter, { signal: getSignal() })
  ),
  get: cancelify(({ getSignal }, [id]) =>
    rawOrderApi.get(id, { signal: getSignal() })
  ),
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

To combine an external signal with a deadline, pass both to `timeout`: `timeout(promise, 5000, {
signal })` races the deadline and the signal together and cancels the underlying promise whichever
wins.

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

`createSuppressError` and `createCatchError`, re-exported from
[`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#ending-a-cancelable-flow),
compile a fixed set of expected errors once:
`createSuppressError(CancelError, isAbortError, isTimeoutError, 'RetryError')` swallows all four
kinds and rethrows anything else.

### Retry and polling

`retry` takes a function of the attempt number, so the attempt itself can vary, and backs off
exponentially between attempts (`retries`, `minTimeout`, `factor`, `maxTimeout`, `onRetry`).
Canceling stops both the wait and the attempt in flight.

`waitFor` polls a condition (`interval`, `timeout`). An async condition is awaited before the next
poll is scheduled, so slow checks never overlap.

### Lazy promises

`LazyPromise` defers its executor until the first subscription, caches the result so every later
consumer shares one execution, and can be canceled before it ever runs:

```js
import { LazyPromise } from '@cancjs/toolbox';

const session = LazyPromise.try(connect);

session.cancel(); // before the first subscription, connect() never runs
await session;     // starts here; a second await gets the same session, not a second connect
```

It mirrors the full `CancelablePromise` static surface (`try`, `resolve`, `reject`,
`withResolvers`, `all`, `race`, `any`, `allSettled`), and combinators stay cold: an aggregate does
not subscribe to its inputs until the aggregate itself is subscribed. `createLazyPromise(x,
options?)` is the front door for input whose shape varies, function, lazy promise, plain promise
or value, and passes a lazy input through unchanged so its laziness survives.

`lazy.execute()` starts the work without subscribing to it, which matters for prefetch-then-await:
`void lazy.then()` builds a derived promise with no handlers, so a later rejection on it is
reported unhandled even when the lazy itself is awaited elsewhere. `execute()` has no such node.

Laziness stops at the first subscription and does not carry through a chain: `delay(1000, { lazy:
true }).then(f)` starts at the `.then`, because `then` is what a subscription is. A cold multi-step
chain is a `cancAsync` body that has not been called yet, not a chain of lazy promises.

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

| Export                          | Description                                                   |
| ------------------------------- | ------------------------------------------------------------- |
| `delay(ms, options?)`           | Resolves after `ms`, cancel clears the timer                  |
| `delay(input, ms, options?)`    | Resolves with `input`'s value after `ms`                      |
| `minDelay(input, ms, options?)` | Settles no earlier than `ms`, for flicker-free loading states |
| `timeout(ms, options?)`         | Rejects with `TimeoutError` after `ms`                        |
| `timeout(input, ms?, options?)` | Settles with `input` and cancels it, unless `ms` passes first |
| `waitFor(condition, options?)`  | Resolves once `condition` is truthy, polling at `interval`    |

`ms` is a number of milliseconds or a `[min, max]` tuple, rolled once per call for a jittered
duration. It is always the last positional argument before `options`: one positional argument is
the duration, two is `(input, duration)`. `input` is a value, a promise, or a function; `delay`
calls a function input after the timer, `minDelay` and `timeout` call it immediately.

`delay` and `minDelay` differ only on rejections. `delay` holds an early rejection until `ms`
elapses, alongside everything else. `minDelay` reports it the moment it happens, because it is a
floor on success, not a timer. Pick the one that matches what a failure should do.

### Control

| Export                   | Description                                                           |
| ------------------------ | --------------------------------------------------------------------- |
| `retry(input, options?)` | Retries with exponential backoff, `input` receives the attempt number |
| `defer(options?)`        | `{ promise, resolve, reject, cancel }` where `promise` is cancelable  |

### Adapters

| Export                           | Description                                                            |
| -------------------------------- | ---------------------------------------------------------------------- |
| `cancelify(fn, options?)`        | Wraps a promise-returning fn, giving it a signal that aborts on cancel |
| `promisify(fn, options?)`        | Wraps a callback-style fn into one returning a cancelable promise      |
| `promisifyAll(source, options?)` | Applies `promisify` across an object's methods                         |

### Signal interop

| Export                             | Description                                                      |
| ---------------------------------- | ---------------------------------------------------------------- |
| `toAbortSignal(promise)`           | Signal that aborts when the promise cancels or rejects           |
| `withSignal(signal, promiseOrFn)`  | Races work against a signal, passes through when there is none   |
| `createAbortSignal()`              | Plain `AbortController` convenience, returns `{ signal, abort }` |
| `suppress(promise, options?)`      | Swallows a cancellation, rethrows everything else                |
| `suppressAbort(promise, options?)` | Swallows a cancellation and a plain abort                        |

### Lazy promises

| Export                                     | Description                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `new LazyPromise(executor, options?)`      | Executor form, deferred to the first subscription                         |
| `LazyPromise.try(fn, ...args)`             | Deferred call of `fn`, `CancelablePromise.try` semantics                  |
| `createLazyPromise(x, options?)`           | Front door: function, lazy promise, plain promise or value                |
| `LazyPromise.all/race/any/allSettled(...)` | Cold combinators, semantics from `CancelablePromise`                      |
| `LazyPromise.withResolvers(options?)`      | `{ promise, resolve, reject, cancel }`, adoption deferred to subscription |
| `lazy.execute()`                           | Starts the work now, without subscribing to it                            |
| `lazy.started`                             | Whether the executor has been triggered                                   |
| `isLazyPromise(value)`                     | Brand check                                                               |

### Errors

`AbortError`, `isAbortError(error)`, `TimeoutError`, `isTimeoutError(error)`, `AggregateError`,
`isAggregateError(error)`, `createSuppressError(...matchers)`, `createCatchError(...matchers)`.

## Compatibility

Node.js 18 and later, current browsers, TypeScript 4.2 and later. `AbortController` and
`AbortSignal` are required by the signal interop helpers. Everything else follows
[`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

For the same helpers on plain `Promise`, without cancellation, see
[`@cancjs/toolbox-native`](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox-native).

## Documentation

- [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for the
  cancellation model and options
- [Coroutines](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine) for using
  these helpers inside a cancelable flow
- [Examples](https://github.com/cancjs/canc/tree/master/examples): `demo-toolbox` for the
  helpers under cancellation, `demo-signal-interop` for the bridges

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](./LICENSE)
