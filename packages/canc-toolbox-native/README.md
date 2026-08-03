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

- timing, control and rate limiting helpers on plain `Promise`
- callback adapters (`promisify`, `promisifyAll`) with the same options as the cancelable twin
- no dependencies

## Getting Started

### Installation

```sh
npm install @cancjs/toolbox-native
```

Core packages, `@cancjs/promise` and `@cancjs/coroutine`, follow strict semver and are safe on a caret pin, `^1`. Everything else, the toolbox, `fetch`, decorators, axios and the adapters that follow, releases on a shared minor line that can carry a breaking change inside a minor, so pin those with a tilde, `~1.4` (pin the minor, not `~1.x`, which npm expands to the same range as `^1`). Full policy, including the deprecation and compatibility-floor rules: [Versioning](docs/versioning.md).

### Usage

```js
import { delay, retry, timeout } from '@cancjs/toolbox-native';

await delay(1000);

const report = await retry((attempt) => buildReport({ attempt }), {
  retries: 5,
  minTimeout: 200,
});

const quotes = await timeout(fetchQuotes(), 3000);
```

## Description

The difference from the cancelable twin is what happens to work already in flight. Here nothing
can be stopped: `timeout` rejects but the underlying promise runs to completion, a pending `retry`
attempt finishes even after the returned promise has been abandoned, and a `delay` timer that
nobody waits for still fires.

Signal interop and `cancelify` have no meaning without cancellation and are twin-only.

### Lazy promises

`LazyPromise` here has no `cancel()`. Deferred start, caching and the `try`/`resolve`/`reject`/
`withResolvers`/`all`/`race`/`any`/`allSettled` statics work the same as the cancelable twin; the
only way to stop waiting on one is an `AbortSignal`:

```js
import { createLazyPromise } from '@cancjs/toolbox-native';

const profile = createLazyPromise(loadProfile, { signal });
```

An already-aborted signal means the executor never runs at all; aborting while it is running
rejects with the signal's `reason`. The underlying work itself keeps going. Only the waiting
stops, because a native promise cannot be canceled.

## API

`delay(ms, options?)`, `delay(input, ms, options?)`, `minDelay(input, ms, options?)`,
`timeout(ms, options?)`, `timeout(input, ms?, options?)`, `waitFor(condition, options?)`,
`retry(input, options?)`, `defer()`, `promisify(fn, options?)`, `promisifyAll(source, options?)`,
`TimeoutError`, `isTimeoutError(error)`, `LazyPromise`, `LazyPromise.try(fn, ...args)`,
`createLazyPromise(x, options?)`, `isLazyPromise(value)`.

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
