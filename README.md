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

<!-- animated comparison (plain async/await vs AbortSignal vs canc) goes here -->

```ts
import * as canc from '@cancjs/coroutine';
import { cancelableFetch } from '@cancjs/fetch';

const loadTrip = canc.async(function* (tripId: string) {
	const response = yield* canc.await(cancelableFetch(`/api/trips/${tripId}`));
	const trip = yield* canc.await(response.json());

	const [hotels, flights] = yield* canc.await.all([
		searchHotels(trip.city),
		searchFlights(trip.city),
	]);

	return { trip, hotels, flights };
});

const pending = loadTrip('lis-42');

// The user navigated away. One call stops the whole tree: requests in flight
// are aborted, the steps after them never run.
pending.cancel();
```

## Features

* 🧩 cancelable promise built on native `Promise`, cancellation is a rejection you can catch
* 🔄 two-way cancellation: it flows down the chain and bubbles back up when nobody wants the value
* ⚡ generator coroutines that replace `async`/`await` and `async function*`
* 🌐 cancelable Fetch API, with `AbortSignal` interop in both directions
* 🧰 utility toolbox (`delay`, `timeout`, `retry`, `waitFor`) plus adapters that make existing APIs cancelable
* 💤 lazily evaluated promises that never start if nobody subscribes
* 🎀 decorators for TypeScript and Babel
* 🔌 third-party integrations for axios, RxJS, React, Express and more
* 🧬 twin packages on plain `Promise` for the parts that do not need cancellation
* 📦 CJS, ESM and UMD builds for modern and legacy browsers and Node.js
* 🔷 TypeScript-first, with types inferred through every step

## Packages

### Core

| Package | Native twin | Description |
|---|---|---|
| [`@cancjs/promise`](packages/canc-promise) | ⚪ | Cancelable promise implementation based on ES `Promise` |
| `@cancjs/promise-legacy` 🚧 | ⚪ | The same core for older engines and polyfilled `Promise` |
| [`@cancjs/coroutine`](packages/canc-coroutine) | ⚪ | Cancelable generator-based drop-in replacements for `async`/`await` and async iterators |
| [`@cancjs/decorators`](packages/canc-decorators) | ⚪ | Class-method decorators for coroutines, in all three decorator dialects |

### Extended

| Package | Native twin | Description |
|---|---|---|
| [`@cancjs/fetch`](packages/canc-fetch) | ⚪ | Cross-platform Fetch API that returns cancelable promises |
| [`@cancjs/lazy-promise`](packages/canc-lazy-promise) | [`@cancjs/lazy-promise-native`](packages/canc-lazy-promise-native) | Lazily evaluated promise-like, the executor runs on first subscription |
| [`@cancjs/toolbox`](packages/canc-toolbox) | [`@cancjs/toolbox-native`](packages/canc-toolbox-native) | Helper functions, ponyfills and adapters for cancellation-aware code |

### Third-party integrations

Cancellation only reaches as far as the chain does, so libraries that own the work need an adapter.
These wrap a third-party library so its requests, subscriptions and handlers join the same
cancelable chain. Every one of them is prototyped as a working project in
[examples](examples) before it becomes a package, so the patterns are usable today.

| Package | Description |
|---|---|
| `@cancjs/axios` 🚧 | Axios instances whose request methods return cancelable promises |
| `@cancjs/react` 🚧 | Hooks that tie a cancelable task to a component lifecycle |
| `@cancjs/express` 🚧 | Middleware that cancels a handler chain when the client disconnects |
| `@cancjs/rxjs` 🚧 | Conversion between cancelable promises and observables, without losing cancellation |

⚪ no native twin, 🚧 planned, not released yet.

## How It Works

Cancellation is a special form of promise rejection with cancel error that triggers registered
handlers for the entire cancellation-aware promise chain.

`canc` promises implement two-way cancellation mechanism that treats promise chains as
subscriptions:

* cancellation propagates down the promise chain when parent promise is canceled

* cancellation bubbles up the chain when all child promises are canceled and parent promise value
	is no longer consumed

Bubbling can be turned off per promise when the work causes side effects that should not be
discarded implicitly. Both directions work through `all`, `race` and the other combinators, and
through every coroutine step.

A chain is cancelable only if it consists of `canc` promises. This requires cancellation-aware
wrappers for Fetch API and third-party libraries, and `async`/`async*` functions need to be
replaced with generator-based coroutines. The full model lives in
[`@cancjs/promise`](packages/canc-promise#how-it-works).

## Motivation

Promise cancellation is highly beneficial in real life scenarios yet it's not a part of existing
ECMAScript specification. JavaScript API like Fetch `AbortController` use their own mechanisms
that aren't unified with native promises.

A situation that is common in modern JavaScript applications is that a process like network
request that stands behind long-running asynchronous task is abortable, consumers need to
unsubscribe from results and abort initial process when it's no longer needed. This eventually
becomes harder with uncancelable promises when a task is composed of smaller independent tasks.

### The problem, in code

Plain `async`/`await` cannot be interrupted. The caller walks away, the work does not:

```ts
async function loadTrip(tripId: string) {
	const trip = await fetchTrip(tripId);
	// The user already left. Both requests below still go out.
	const hotels = await searchHotels(trip.city);
	const flights = await searchFlights(trip.city);
	return { trip, hotels, flights };
}
```

`AbortController` fixes it, and the cost is spread over every layer. The signal becomes a
parameter of everything, every gap between steps needs a guard, and the caller has to sort
cancellation out of real failures:

```ts
async function loadTrip(tripId: string, signal: AbortSignal) {
	const trip = await fetchTrip(tripId, signal);
	// Not every API takes a signal, so the gaps need manual guards.
	const hotels = await searchHotels(trip.city);
	signal.throwIfAborted();
	const flights = await searchFlights(trip.city, signal);
	return { trip, hotels, flights };
}

const controller = new AbortController();

loadTrip('lis-42', controller.signal).catch((err) => {
	if (err.name === 'AbortError') return; // expected, not a bug
	throw err;
});
```

With `canc` the plumbing goes away. The signature stays clean, the steps stay readable, and
canceling the returned promise stops everything below the current step:

```ts
const loadTrip = canc.async(function* (tripId: string) {
	const trip = yield* canc.await(fetchTrip(tripId));
	const hotels = yield* canc.await(searchHotels(trip.city));
	const flights = yield* canc.await(searchFlights(trip.city));
	return { trip, hotels, flights };
});

const pending = loadTrip('lis-42');
pending.cancel();
```

### Background

* **No official solution**. [Native cancelable promises](https://github.com/tc39/proposal-cancelable-promises)
	were incompatible with ES6 promise semantics, provided one-way cancellation, used unwieldy
	cancel tokens and have been abandoned.

* **`AbortController` is the standard, and it works**. It is the platform primitive, it is not
	going away, and `canc` interoperates with it in both directions. What it does not do is
	propagate through a promise chain on its own. Threading a signal through every layer and
	guarding every gap is a developer experience problem, not a missing capability, and it is the
	problem this ecosystem exists to remove.

* **Bluebird is no longer an option**. Bluebird has bulky stable API and has been largely
	superseded by ES promises, particularly due to `async`/`await`. Its
	[two-way cancellation](http://bluebirdjs.com/docs/api/cancellation.html) is disabled by
	default, leaves canceled promises unsettled instead of rejecting them, and the library is
	unmaintained.

* **Observables are the working alternative, at a price**. RxJS has offered cancellation for
	years and still does. The objection is ergonomic rather than functional: there is no sugar
	comparable to `async`/`await`, cancellation is easy to lose the moment a promise enters the
	pipeline, observables are push-based so they do not replace pull-based async iterators, and
	adopting a large API to cancel one request is a steep trade. No
	[native observable](https://github.com/tc39/proposal-observable) exists yet.

* **No universal third-party options**. The renowned `p-*`
	[package collection](https://github.com/sindresorhus/promise-fun#packages) only supports
	one-way cancellation and targets Node.js. It is the closest popular attempt to extend native
	promises for this purpose, which is why it is worth naming at all.

## Performance

Anything built on top of native `Promise` is slower than native `Promise`, and `canc` wraps every
operation in cancellation bookkeeping on top of that. The goal is not to win microbenchmarks, it
is to stay irrelevant next to the I/O the promises are waiting on.

In a simulated request waterfall (5 sequential and 3 parallel requests, 30% canceled mid-flight)
`canc` costs about 45% more per request operation than hand-wired `Promise` plus
`AbortController`, and bluebird costs about 20% more. In absolute terms that is well under a
microsecond of extra work per operation, against a request measured in milliseconds. In isolated
hot loops the ratios grow: a 10-deep `then` chain runs roughly 9 times slower than native, where
bluebird runs about 7 times slower. Memory follows the same shape, around 380 bytes per promise
against 57 for native and 121 for bluebird, which starts to matter with thousands of promises in
flight at once.

Bluebird is the useful yardstick here. It carried that kind of overhead in production for years
and nobody considered it a problem, because application time goes into the network and not into
promise machinery. Tight loops that create and cancel promises faster than any I/O they wrap are
the exception, and a mount and unmount lifecycle simulation is several times slower than native,
so measure that shape against your own budget.

Full methodology, machine specs and per-suite results live in [`docs/benchmarks.md`](docs/benchmarks.md);
the harness itself is in [`benchmarks`](benchmarks).

## Examples

[examples](examples) is a separate npm project with runnable projects, each written twice: a
plain version and a `canc` version of the same application, so the difference is a diff and not a
description. The vanilla side is not a strawman, it includes the real `AbortController` attempt
wherever that is the point of the comparison.

It covers React, Vue, Angular, Express, Fastify, NestJS, Kysely, Mongoose, TypeORM, axios, RxJS,
WebSockets, CLI tools and LLM streaming, plus small focused demos for each part of the ecosystem.

## Compatibility

Node.js 18 and later, and current browsers with native `Symbol`, `Reflect`, `Promise`,
`Object.assign` and `Object.setPrototypeOf`. TypeScript 4.2 and later.

Every package ships CJS, ESM and UMD builds compiled from ES5-targeted source, so the output also
runs on older engines that are not part of the test matrix. Per-package details are in each
package README, starting with [`@cancjs/promise`](packages/canc-promise#compatibility).

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](LICENSE)
