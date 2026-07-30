<div align="center">
	<img src="./assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<div align="center">

[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](#contributing)

</div>

<p align="center">
Cancelable promise ecosystem based on native <code>Promise</code>: coroutines, async iterators, decorators, utilities, third-party library helpers.
</p>

---

<!-- TODO: animated comparison (plain async/await vs AbortSignal vs canc) -->

```ts
import * as canc from '@cancjs/coroutine';

const loadTrip = canc.async(function* (tripId: string) {
	const hotels = yield* canc.await(searchHotels(tripId));
	const flights = yield* canc.await(searchFlights(tripId));
	return { hotels, flights };
});

const tripPromise = loadTrip('lis-42');

// The user navigated away. One call stops the whole tree.
tripPromise.cancel();
```

## Features

- ❎ cancelable promise that extends native `Promise`
- 🔃 two-way, deep cancellation: propagates down the chain, bubbles up when a value goes unclaimed
- ⚡ generator coroutines as drop-in replacements for `async`/`await` and async iterators
- 🧰 utility toolbox: `debounce`, `delay`, `timeout`, lazy evaluation and other helpers
- 🔌 cancelable `fetch` and third-party integrations: React, Express, Axios and more
- 🎀 class method decorators: standard and legacy (TypeScript, Babel)
- 🧬 twin ecosystem packages for native `Promise`
- 📦 cross-platform: Node.js, Deno, Bun and browsers
- 🟦 extensive TypeScript support

## Motivation

Cancellation is standard in languages with async primitives, from Kotlin coroutines to Swift tasks to Rust futures. JavaScript is an unfortunate exception: a promise has no way to be stopped once started, and `async`/`await` is syntax sugar over promises, so it inherits the same limitation.

In practice this means wasted work. A component unmounts while its data is still loading. A route changes but the previous page's API calls keep going. A user cancels a search but the requests and retries continue. The deeper a task is composed of subtasks, the harder it gets to stop cleanly.

The platform has `AbortController`. It gives you a signal you can pass to `fetch` and other APIs, but the signal has to be threaded through every function call, gaps between steps need manual guards, and `AbortError` has to be filtered from real errors at every catch boundary. For a single `fetch` call this is manageable. For a chain of requests, parallel work and third-party libraries that may or may not accept a signal, the boilerplate adds up fast and the signal micromanagement becomes a cost of its own.

`canc` moves cancellation into the promise chain itself. Cancel one promise and every step below it stops. Combinators carry the same behavior: `race` cancels the losers, and when every promise inside an `all` is canceled, the `all` itself is canceled too. No signals to thread, no guards to write.

### The problem, in code

Plain `async`/`await` cannot be interrupted. The caller walks away, the work does not:

```ts
async function loadTrip(tripId: string) {
	const trip = await fetchTrip(tripId);
	// The user already left. Both searches still go out.
	const [hotels, flights] = await Promise.all([
		searchHotels(trip.city),
		searchFlights(trip.city),
	]);
	return { trip, hotels, flights };
}
```

`AbortController` fixes the interruption, and the cost is spread over every layer. The signal becomes a parameter of everything, every gap between steps needs a guard, and the caller has to sort cancellation out of real failures:

```ts
async function loadTrip(tripId: string, signal: AbortSignal) {
	const trip = await fetchTrip(tripId, signal);
	// Not every API takes a signal, and every gap between steps needs a guard.
	signal.throwIfAborted();
	const [hotels, flights] = await Promise.all([
		searchHotels(trip.city, signal),
		searchFlights(trip.city, signal),
	]);
	return { trip, hotels, flights };
}

const controller = new AbortController();

loadTrip('lis-42', controller.signal).catch((err) => {
	if (err.name === 'AbortError') return; // expected, not a bug
	throw err;
});

controller.abort();
```

With `canc` the plumbing goes away. The signature stays clean, the steps stay readable, and canceling the returned promise stops everything below the current step:

```ts
const loadTrip = canc.async(function* (tripId: string) {
	const trip = yield* canc.await(fetchTrip(tripId));
	const [hotels, flights] = yield* canc.await.all([
		searchHotels(trip.city),
		searchFlights(trip.city),
	]);
	return { trip, hotels, flights };
});

const tripPromise = loadTrip('lis-42');

tripPromise.cancel();
```

### Background

- **No all-round official solution**. [Native cancelable promises](https://github.com/tc39/proposal-cancelable-promises) were incompatible with ES6 promise semantics and have been abandoned. `AbortController` is the platform primitive for aborting operations, but it is a low-level signaling mechanism, not a cancellation model for promise chains. Propagation through layers, cleanup coordination and consumer tracking stay manual. `canc` can interoperate with `AbortSignal` but doesn't require it.

- **Bluebird is no longer an option**. Bluebird has bulky stable API and has been largely superseded by ES promises, particularly due to `async`/`await`. Its [two-way cancellation](https://github.com/petkaantonov/bluebird/blob/master/docs/docs/api/cancellation.md) is disabled by default, leaves canceled promises unsettled instead of rejecting them, and the library is unmaintained.

- **Observables aren't a magic bullet**. Observables can provide a superset of promise features, including cancellation. [RxJS](https://github.com/ReactiveX/rxjs) is the established implementation, with a notoriously complex API surface. There is no `async`/`await` equivalent for observable code, and cancellation is easy to lose in promise interop. Observables are push-based and don't displace pull-based async iterators. No [native observable](https://github.com/tc39/proposal-observable) implementation exists yet.

- **No universal third-party options**. The popular `p-*` [package collection](https://github.com/sindresorhus/promise-fun#packages) only supports one-way cancellation and targets Node.js.

## How It Works

Cancellation is a special form of promise rejection with a `CancelError`. It triggers registered cancel handlers through the chain, and because it is an ordinary rejection, existing `try`/`catch` and `.catch()` keep working without changes.

`canc` promises implement a two-way cancellation mechanism that treats promise chains as subscriptions:

- cancellation propagates down the promise chain when a parent promise is canceled

- cancellation bubbles up the chain when all child promises are canceled and the parent promise value is no longer consumed

Both directions work through `all`, `race` and the other combinators, and through every coroutine step. The behavior can be fine-tuned per promise through options like `bubble` and `shield`, so work with side effects can be protected from implicit cancellation.

A chain is cancelable only if it consists of `canc` promises. This requires cancellation-aware wrappers for Fetch API and third-party libraries, and `async`/`async*` functions need to be replaced with generator-based coroutines.

## Packages

### Core

| Package                                        | Native counterpart                         | Description                                                                  |
| ---------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| [`@cancjs/promise`](packages/canc-promise)     | `Promise`                                  | Cancelable promise built on native `Promise`                                 |
| `@cancjs/promise-legacy` 🚧                    | `Promise` polyfill                         | The same core for older engines with polyfilled `Promise`                    |
| [`@cancjs/coroutine`](packages/canc-coroutine) | `async`/`await`, `async*`, `for await..of` | Generator-based drop-in replacements for `async`/`await` and async iterators |

### Extended

| Package                                          | Native counterpart                                       | Description                                                       |
| ------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------- |
| [`@cancjs/fetch`](packages/canc-fetch)           | `fetch` + `AbortController`                              | Cancelable Fetch API with automatic signal management             |
| [`@cancjs/toolbox`](packages/canc-toolbox)       | [`@cancjs/toolbox-native`](packages/canc-toolbox-native) | Helper functions and adapters for cancellation-aware code         |
| [`@cancjs/decorators`](packages/canc-decorators) | ✖                                                        | Class method decorators for coroutines: standard, legacy TS/Babel |

### Third-party integrations

Cancellation only reaches as far as the chain does, so libraries that own the work need an adapter. Working integrations for commonly used libraries are available in [examples](examples).

| Package                                | Description                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [`@cancjs/axios`](packages/canc-axios) | Axios instances whose request methods return cancelable promises                                         |
| `@cancjs/react` 🚧                     | Hooks that tie a cancelable task to a component lifecycle. See [example](examples/app-react)             |
| `@cancjs/server-express` 🚧            | Middleware that cancels a handler chain on client disconnect. See [example](examples/app-express-kysely) |
| `@cancjs/server-fastify` 🚧            | Plugin that cancels a handler on client disconnect. See [example](examples/app-fastify-mongoose)         |
| `@cancjs/rxjs` 🚧                      | Conversion between cancelable promises and observables. See [example](examples/app-rxjs)                 |

## Performance

Any library built on native `Promise` is inevitably slower than native `Promise` in microbenchmarks. In a realistic request waterfall, `canc` adds about 45% overhead versus hand-wired `Promise` plus `AbortController`. Bluebird adds about 20% in the same scenario and successfully carried that cost in production for years. In absolute terms both are well under a microsecond per operation, against network I/O measured in milliseconds. Applications don't bottleneck on promise machinery. Canceling a request chain early saves more time and memory than the bookkeeping costs.

Full methodology and results are in the [benchmark report](docs/benchmarks.md), and the [benchmark suite](benchmarks) is part of the repository.

## Examples

Every example is written twice: a plain version and a `canc` version of the same application. The vanilla side includes the real `AbortController` approach, so the comparison is fair. Side-by-side across React, Vue, Angular, Express, Fastify, NestJS, databases, Axios, RxJS, CLI tools and LLM streaming.

[Browse examples](examples)

## Compatibility

Node.js 18 and later, Deno, Bun and current browsers. TypeScript 4.2 and later. Per-package details are in each package README, starting with [`@cancjs/promise`](packages/canc-promise#compatibility).

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](LICENSE)
