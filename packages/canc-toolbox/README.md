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

- timing, control, rate limiting and concurrency helpers that clean up after themselves on cancellation
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
a breaking change, so pin it with a tilde, `~1.4` (pin the minor, not `~1.x`, which npm expands to the
same range as `^1`), rather than the default caret. See
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

const searchFlights = cancelify(({ getSignal }, query) =>
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
  list: cancelify(({ getSignal }, filter) =>
    rawOrderApi.list(filter, { signal: getSignal() })
  ),
  get: cancelify(({ getSignal }, id) =>
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

`toAbortSignal(promise)` derives a signal from a promise. For a cancelable promise, the signal
aborts when the promise is canceled, not on rejection. For a plain promise or thenable, the signal
aborts on any rejection, because a plain promise has no cancelation to distinguish from a rejection.
Use it when passing cancelable work to an API that only speaks `AbortSignal`.

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

`fromAbortSignal(signal, options?)` is the inverse of `toAbortSignal`: it fulfills once `signal`
aborts, and never rejects on its own (canceling it explicitly still rejects with a `CancelError`).
Read `signal.reason` off the signal itself; the resolved value is `void`.

```js
await fromAbortSignal(userSignal);
console.log('the user aborted:', userSignal.reason);
```

This is not how to make an operation cancelable by a signal. For that, pass `signal` as a
`CancelablePromise` constructor option to the operation itself.

### Ending a flow

> Note: Error classes and filtering helpers (`AbortError`, `isAbortError`, `TimeoutError`, `isTimeoutError`, `createCatchError`, `createSuppressError`, `catchAbort`, `suppressAbort`, `catchTimeout`, `suppressTimeout`) have moved to `@cancjs/promise`. Re-exports in `@cancjs/toolbox` are deprecated and maintained for backward compatibility.

Filtering error helpers swallow specific expected errors when a flow ends:

```js
await suppressAbort(uploadInProgress);
```

Four pair helpers are exported:

- `catchAbort(promiseOrError)` / `suppressAbort(promiseOrError)`: matches an abort (`AbortError` or a `CancelError` caused by an abort). An ordinary cancellation is rethrown.
- `catchTimeout(promiseOrError)` / `suppressTimeout(promiseOrError)`: matches a timeout (`TimeoutError` or a `CancelError` caused by a timeout). An ordinary cancellation is rethrown.

`suppressAbort` does not swallow an ordinary cancellation. To swallow an ordinary cancellation as well as an abort, use `suppressCancel(promise, { abort: true })` from `@cancjs/promise`.

`createCatchError(...matchers)` and `createSuppressError(...matchers)` compile a matcher function for a custom set of expected errors:

```js
const suppressExpected = createSuppressError(AbortError, TimeoutError, 'RetryError');

await suppressExpected(searchProducts(query));
```

### Retry and polling

`retry` takes a function of the attempt number, so the attempt itself can vary, and backs off
exponentially between attempts (`retries`, `initialDelay`, `factor`, `maxDelay`, `jitter`,
`shouldRetry`, `delay`, `onRetry`). `retries` counts attempts after the first (default: 3, for up to
4 attempts total). `initialDelay` and `maxDelay` replace the deprecated `minTimeout` and
`maxTimeout` aliases. Canceling stops both the wait and the attempt in flight.

`waitFor` polls a condition (`interval`, `timeout`). An async condition is awaited before the next
poll is scheduled, so slow checks never overlap.

#### Differences from p-retry

`retry` serves as a drop-in alternative to `p-retry` in common retry loops, with a few deliberate
revisions to option naming and signatures:

| Option / feature        | p-retry                                  | retry                                                                     |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| Initial delay           | `minTimeout`                             | `initialDelay` (`minTimeout` kept as deprecated alias)                    |
| Maximum delay           | `maxTimeout`                             | `maxDelay` (`maxTimeout` kept as deprecated alias)                        |
| Jitter / randomization  | `randomize: boolean`                     | `jitter: boolean \| number` (`true` for full jitter, number for fraction) |
| Failed-attempt callback | `onFailedAttempt(error)` (single object) | `onRetry(reason, attempt, delay)` (positional arguments)                  |
| Total time budget       | `maxRetryTime`                           | Absent; wrap with `timeout(retry(fn), ms)` to cancel the running attempt  |
| Retry consumption check | `shouldConsumeRetry`                     | Absent; use `shouldRetry(reason, ctx)`                                    |
| Event loop unref        | `unref`                                  | Absent; pass custom timers via `{ setTimeout, clearTimeout }` if needed   |
| Abort signal            | `signal`                                 | Absent; cancel the returned promise directly                              |

### Custom timers per call

Every timing helper (`delay`, `minDelay`, `timeout`, `retry`, `waitFor`, `debounce`, `throttle`)
accepts a `setTimeout`/`clearTimeout` pair in its options, resolved ahead of the package's own
default timers, which stay the last resort:

```js
await retry(loadInvoice, { retries: 3, setTimeout: myTimers.setTimeout, clearTimeout: myTimers.clearTimeout });
```

The pair is accepted whole or not at all, since a `setTimeout` from one source paired with a
`clearTimeout` from another leaks the timer it thinks it cleared.

The case this exists for is a timers pair backed by the platform's prioritized task scheduler
rather than the ordinary timer queue. A wait resumes at a priority the caller chose, instead of
joining one undifferentiated queue where a background retry competes with work the user is looking
at; a resume that has not fired yet can still be re-prioritized, which a queued `setTimeout`
callback cannot; the pair itself is not capped at 2^31-1ms, though the helpers still split a longer wait into chunks before it reaches the pair;
canceling dequeues the pending resume with the real cancel reason instead of an opaque
`clearTimeout`; and deeply nested `setTimeout` calls get clamped to a few milliseconds by browsers,
a penalty a poll or backoff loop hits and a scheduled task does not accumulate.

The honest limits carry over too: a hidden tab throttles a scheduled task the same as it throttles
a timer, and where no such scheduler exists, the pair is simply the platform timers again and
priority means nothing.

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

### Declared failures

A helper that takes the work as an argument reads the declared failure set off that argument, so the set survives the wrapper with no type argument at the call site.

- `retry`, `minDelay`, `debounce`, `throttle` and `delay(input, ms)` take the failure set from the work they wrap.
- `timeout` and `waitFor` declare `TimeoutError`. `timeout` declares it in place of the input's set, not on top of it, so `timeout(input, ms)` declares `TimeoutError` alone.
- `delay(ms)`, `defer` and `promisify` declare a `never` failure set. None of them wraps a promise to read one from.
- `cancelify` and the `LazyPromise` family declare a `never` failure set even though they do wrap work. Neither carries the wrapped set yet.

Cancellation (rejection with a `CancelError`) is part of the cancellation control flow rather than an application failure set. See [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for details on declared failures and error matching.

## API

Every helper takes
[`CancelablePromise` options](https://github.com/cancjs/canc/tree/master/packages/canc-promise#options)
as its last argument.

### Options

| Option   | Description                                                                                   |
| -------- | --------------------------------------------------------------------------------------------- |
| `bubble` | Cancel travels back up to the parent once every child is canceled and the value is unconsumed |
| `shield` | Stops cancel from propagating down into this promise                                          |
| `signal` | An `AbortSignal` that cancels the promise when it aborts                                      |
| `lazy`   | Defers the work until the first subscription. Not accepted everywhere, see below              |

`bubble`, `shield` and `signal` come from `CancelablePromise` and behave identically here.

`lazy` is a toolbox addition. It defers starting the work (the timer, the retry attempt, the poll,
the callback invocation) until the first `then`, `catch`, `finally` or `await`. Accepted by `delay`,
`timeout`, `retry`, `waitFor` and `promisify`. The helpers that must start immediately, `minDelay`,
`defer`, `debounce`, `throttle` and `cancelify`, reject it at compile time rather than accepting it
and ignoring it.

Laziness is not contagious. `delay(1000, { lazy: true }).then(f)` starts the timer at the `.then`
call, because a subscription is what wakes it. It does not defer anything further down the chain.

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

### Rate limiting

| Export                       | Description                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `debounce(fn, ms, options?)` | Debounces function calls, returning a wrapper with `cancel()`, `flush()`, `isPending` |
| `throttle(fn, ms, options?)` | Throttles function calls, returning a wrapper with `cancel()`, `flush()`, `isPending` |

A superseding call cancels an in-flight call on a cancelable promise implementation or rejects a not-yet-invoked call with `SupersededError` on a plain implementation. A fire-and-forget call needs a rejection handler attached so a superseded call is not unhandled.

### Concurrency

| Export                         | Description                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `limit(concurrency)`           | A callable pool: `limited(fn, ...args)`, plus `active`, `pending`, settable `concurrency`, `cancel(reason?)` |
| `map(input, mapper, options?)` | Concurrency-bounded, input-ordered `map`; cancel stops in-flight work and drops the queue                    |

Both are built on the same limiter. Canceling either stops what is running and never starts what is
queued, and every dropped job still settles provided the underlying job itself settles.

### Adapters

| Export                           | Description                                                            |
| -------------------------------- | ---------------------------------------------------------------------- |
| `cancelify(fn, options?)`        | Wraps a promise-returning fn, giving it a signal that aborts on cancel |
| `promisify(fn, options?)`        | Wraps a callback-style fn into one returning a cancelable promise      |
| `promisifyAll(source, options?)` | Applies `promisify` across an object's methods                         |

### Signal interop

| Export                              | Description                                                      |
| ----------------------------------- | ---------------------------------------------------------------- |
| `toAbortSignal(promise)`            | Signal that aborts when a cancelable promise is canceled         |
| `fromAbortSignal(signal, options?)` | Fulfills once `signal` aborts, cancel removes the listener       |
| `withSignal(signal, promiseOrFn)`   | Races work against a signal, passes through when there is none   |
| `createAbortSignal()`               | Plain `AbortController` convenience, returns `{ signal, abort }` |

### Filtering errors (deprecated, import from @cancjs/promise)

| Export                             | Description                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `catchAbort(promiseOrError)`       | Returns an `AbortError` or abort-caused `CancelError`, rethrows everything else     |
| `suppressAbort(promiseOrError)`    | Swallows an `AbortError` or abort-caused `CancelError`, rethrows everything else    |
| `catchTimeout(promiseOrError)`     | Returns a `TimeoutError` or timeout-caused `CancelError`, rethrows everything else  |
| `suppressTimeout(promiseOrError)`  | Swallows a `TimeoutError` or timeout-caused `CancelError`, rethrows everything else |
| `createCatchError(...matchers)`    | Compiles a matcher returning specified expected errors                              |
| `createSuppressError(...matchers)` | Compiles a matcher swallowing specified expected errors                             |

### Lazy promises

| Export                                        | Description                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `new LazyPromise(executor, options?)`         | Executor form, deferred to the first subscription                         |
| `LazyPromise.try(fn, ...args)`                | Deferred call of `fn`, `CancelablePromise.try` semantics                  |
| `createLazyPromise(x, options?)`, `lazy(run)` | Front door: function, lazy promise, plain promise or value                |
| `LazyPromise.all/race/any/allSettled(...)`    | Cold combinators, semantics from `CancelablePromise`                      |
| `LazyPromise.withResolvers(options?)`         | `{ promise, resolve, reject, cancel }`, adoption deferred to subscription |
| `lazy.execute()`                              | Starts the work now, without subscribing to it                            |
| `lazy.started`                                | Whether the executor has been triggered                                   |
| `isLazyPromise(value)`                        | Brand check                                                               |

### Errors

| Export                     | Description                                                      |
| -------------------------- | ---------------------------------------------------------------- |
| `SupersededError`          | Error class thrown when a trailing or pending call is superseded |
| `isSupersededError(error)` | Checks whether an error is a `SupersededError`                   |

`AbortError`, `isAbortError(error)`, `TimeoutError`, `isTimeoutError(error)` (deprecated; import from `@cancjs/promise`).

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
