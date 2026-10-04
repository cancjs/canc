<div align="center">
  <img src="https://raw.githubusercontent.com/cancjs/canc/master/assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<h1 align="center">@cancjs/toolbox-native</h1>

<p align="center">
A collection of promise helper functions built on native <code>Promise</code>.
</p>

---

## Introduction

The native twin of
[`@cancjs/toolbox`](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox). Same
helpers, same options, backed by the built-in `Promise` and with no cancellation.

Reach for it when a project wants the utility set without adopting cancelable promises, or in a
library that should not force a promise implementation on its consumers.

## Features

- timing, control, rate limiting and concurrency helpers on plain `Promise`
- callback adapters (`promisify`, `promisifyAll`) with the same options as the cancelable twin
- no dependencies

## Getting Started

### Installation

```sh
npm install @cancjs/toolbox-native
```

Core packages, `@cancjs/promise` and `@cancjs/coroutine`, follow strict semver and are safe on a caret pin, `^1`. Everything else, the toolbox, `fetch`, decorators, axios and the adapters that follow, releases on a shared minor line that can carry a breaking change inside a minor, so pin those with a tilde, `~1.4` (pin the minor, not `~1.x`, which npm expands to the same range as `^1`). Full policy, including the deprecation and compatibility-floor rules: [Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md).

### Usage

```js
import { delay, retry, timeout } from '@cancjs/toolbox-native';

await delay(1000);

const report = await retry((attempt) => buildReport({ attempt }), {
  retries: 5, // up to 5 retries (6 attempts total)
  initialDelay: 200,
});

const quotes = await timeout(fetchQuotes(), 3000);
```

## Description

The difference from the cancelable twin is what happens to work already in flight. Here nothing
can be stopped: `timeout` rejects but the underlying promise runs to completion, a pending `retry`
attempt finishes even after the returned promise has been abandoned, and a `delay` timer that
nobody waits for still fires. Same story for `limit` and `map`: `limited.cancel()` rejects the
still-queued handles but lets running jobs finish, and a `map` in progress cannot be stopped, only
abandoned by the caller. Every handle still settles, queued or not, provided the underlying job
itself settles.

Under `debounce` and `throttle`, a superseded pending or trailing call rejects with `SupersededError`.
A fire-and-forget call needs a rejection handler attached so a superseded call is not unhandled.

`fromAbortSignal(signal)` is here, and fulfills once `signal` aborts. Without a cancel channel its
listener comes off on settle only, so racing it against a signal that never fires holds the listener
for as long as the signal lives; the cancelable twin detaches on cancel.

`cancelify` and signal generation (`toAbortSignal`, `withSignal`, `createAbortSignal`) have no meaning without cancellation and are twin-only; `catchAbort`, `suppressAbort`, `catchTimeout`, `suppressTimeout`, `createCatchError`, and `createSuppressError` are provided to filter errors on native promises (no cancellation handling).

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
joining one undifferentiated queue where background work competes with work the user is looking
at; a resume that has not fired yet can still be re-prioritized, which a queued `setTimeout`
callback cannot; the pair itself is not capped at 2^31-1ms, though the helpers still split a longer wait into chunks before it reaches the pair;
and deeply nested `setTimeout` calls get clamped to a few milliseconds by browsers, a penalty a
poll or backoff loop hits and a scheduled task does not accumulate. Canceling a wait here still
only stops the waiting, the same limit as everywhere else in this package: the underlying attempt
runs to completion.

The honest limits carry over too: a hidden tab throttles a scheduled task the same as it throttles
a timer, and where no such scheduler exists, the pair is simply the platform timers again and
priority means nothing.

### Lazy promises

`LazyPromise` here has no `cancel()`. Deferred start, caching and the `try`/`resolve`/`reject`/
`withResolvers`/`all`/`race`/`any`/`allSettled` statics work the same as the cancelable twin; the
only way to stop waiting on one is an `AbortSignal`:

```js
import { createLazyPromise } from '@cancjs/toolbox-native';

const profile = createLazyPromise(loadProfile, { signal });
```

An already-aborted signal means the executor never runs at all; aborting while it is running
rejects with the signal's `reason`. The underlying work itself keeps going. Only the waiting stops, because a native promise cannot be canceled. `lazy` and `createLazyPromise` wrap functions or promises.

### Declared failures

`@cancjs/toolbox-native` operates entirely on built-in native promises. Native promises in JavaScript do not track failure types at the type level, so helpers in this package do not declare typed failure sets. Applications requiring typed failure contracts should use [`@cancjs/toolbox`](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox) with [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise).

## API

`delay(ms, options?)`, `delay(input, ms, options?)`, `minDelay(input, ms, options?)`,
`timeout(ms, options?)`, `timeout(input, ms?, options?)`, `waitFor(condition, options?)`,
`retry(input, options?)`, `debounce(fn, ms, options?)`, `throttle(fn, ms, options?)`, `defer(options?)`,
`limit(concurrency)`, `map(input, mapper, options?)`,
`promisify(fn, options?)`, `promisifyAll(source, options?)`,
`catchAbort(promiseOrError)`, `suppressAbort(promiseOrError)`, `catchTimeout(promiseOrError)`, `suppressTimeout(promiseOrError)`, `createCatchError(...matchers)`, `createSuppressError(...matchers)`,
`AbortError`, `isAbortError(error)`, `TimeoutError`, `isTimeoutError(error)`, `SupersededError`, `isSupersededError(error)`, `LazyPromise`, `LazyPromise.try(fn, ...args)`,
`createLazyPromise(x, options?)`, `lazy(run)`, `isLazyPromise(value)`.

`ms` is a number of milliseconds or a `[min, max]` tuple, and is always the last positional
argument before `options`. Option shapes are identical to
[`@cancjs/toolbox`](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox#api), minus
the cancelable promise options.

## Compatibility

Node.js 18 and later, current browsers, TypeScript 4.2 and later. Ships CJS, ESM and UMD builds
from ES5-targeted source, same as the rest of the ecosystem.

## Documentation

- [`@cancjs/toolbox`](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox) for the
  cancelable twin
- [Repository](https://github.com/cancjs/canc) for the ecosystem overview

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](./LICENSE)
