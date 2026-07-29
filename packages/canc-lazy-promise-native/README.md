<p align="center">
	<img src="../../assets/canc-logo.png" width="483" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
</p>

<h1 align="center">@cancjs/lazy-promise-native</h1>

<p align="center">
Lazily evaluated promise-like backed by native <code>Promise</code>.
</p>

---

## Introduction

The native twin of [`@cancjs/lazy-promise`](../canc-lazy-promise). The executor is deferred until
the value is first subscribed with `then`, `catch`, `finally` or `await`, and the result is cached
so several subscribers share one execution.

There is no cancellation surface here. Use it when the point is laziness alone, for example a
connection or a config load that should happen only if something actually asks for it.

## Features

* the executor runs on first subscription, not on construction
* single execution shared by every subscriber, settled value reused
* plain awaitable with standard microtask ordering, not an observable
* no dependencies

## Getting Started

### Installation

```sh
npm install @cancjs/lazy-promise-native
```

### Usage

```js
import { lazy } from '@cancjs/lazy-promise-native';

const config = lazy((resolve, reject) => {
	loadConfigFile().then(resolve, reject);
});

// Nothing has been read yet.

export async function getConfig() {
	return await config; // the first call runs the executor, later calls reuse the result
}
```

## Description

The executor may return a teardown function, which keeps the contract identical to the cancelable
twin, but without cancellation there is nothing that triggers it during normal use.

Anything that has to be stopped once started belongs in
[`@cancjs/lazy-promise`](../canc-lazy-promise), where canceling before the first subscription
skips the executor entirely and canceling later runs the teardown.

## API

`lazy(executor)` returns a `LazyPromise`, `new LazyPromise(executor)` is the class form. The
executor is `(resolve, reject) => void | (() => void)`.

## Compatibility

Node.js 18 and later, current browsers, TypeScript 4.2 and later. Ships CJS, ESM and UMD builds
from ES5-targeted source, same as the rest of the ecosystem.

## Documentation

* [`@cancjs/lazy-promise`](../canc-lazy-promise) for the cancelable twin
* [root README](../../README.md) for the ecosystem overview

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](../../LICENSE)
