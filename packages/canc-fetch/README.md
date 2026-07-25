<p align="center">
	<img src="../../assets/canc-logo.png" width="483" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; a crafty foundation for cancelable promises">
</p>

<h1 align="center">@cancjs/fetch</h1>

<p align="center">
Cross-platform Fetch API that uses cancelable promises.
</p>

---

## Introduction

`cancelableFetch` has the signature of `fetch` and returns a
[`CancelablePromise`](../canc-promise) instead of a plain one. Canceling it aborts the request.

The controller is created and wired internally, so request code stops carrying a `signal`
parameter. An external signal is still accepted through `init`, which keeps existing abort
plumbing working while it is being phased out.

## Features

* same call signature as the platform `fetch`
* cancellation aborts the request in flight
* accepts an external `AbortSignal` through `init`, including one that is already aborted
* configurable `fetch` and `AbortController` implementations for tests and non-browser hosts
* cancelable interop for the `fetchLater` API
* lazy entry point where the request does not start until the promise is subscribed

## Getting Started

### Installation

```sh
npm install @cancjs/fetch @cancjs/promise
```

`@cancjs/promise` is a peer dependency. The `@cancjs/fetch/lazy` entry point additionally needs
[`@cancjs/lazy-promise`](../canc-lazy-promise), which is an optional peer dependency.

### Usage

```js
import { cancelableFetch } from '@cancjs/fetch';

const request = cancelableFetch('/api/orders?status=open');

request
	.then((response) => response.json())
	.then(render);

// Aborts the request. Nothing after it in the chain runs.
request.cancel();
```

In a coroutine the request joins the surrounding cancellation:

```ts
import * as canc from '@cancjs/coroutine';
import { cancelableFetch } from '@cancjs/fetch';

const loadOrder = canc.async(function* (orderId: string) {
	const response = yield* canc.await(cancelableFetch(`/api/orders/${orderId}`));

	if (!response.ok) {
		throw new Error(`Order request failed with ${response.status}`);
	}

	return yield* canc.await(response.json());
});
```

## How It Works

Each call creates its own `AbortController` and passes the signal to the underlying `fetch`. A
cancel aborts that controller, so the request is dropped at the transport level, and the promise
rejects with a `CancelError` whose `cause` is the abort reason.

That is where cancellation ends. The request stops, the server may have already received it, and
a response body that is being read stops being read. Whatever the server does with a request it
already accepted is outside the client's control.

An `AbortSignal` supplied through `init` keeps working alongside this. Either source can abort the
request, and a signal that is already aborted rejects the promise without a network call.

## Description

### Custom implementations

`cancelableFetchFactory` builds the same function against a given `fetch` and `AbortController`.
Useful in tests, in environments that provide their own implementations, and when requests have to
go through an instrumented `fetch`:

```js
import { cancelableFetchFactory } from '@cancjs/fetch';

const fetchJson = cancelableFetchFactory({
	fetch: instrumentedFetch,
	AbortController: PolyfilledAbortController,
});
```

Both fields are optional, and the ambient globals are read at call time when they are omitted.

### Deferred requests

`cancelableFetchLater` wraps the `fetchLater` API, which registers a request the browser sends
later, typically when the page goes away. The result is a `CancelablePromise` with an extra
`activated` property.

With `activateAfter` in `init`, the promise resolves once the request has been activated. Without
it, there is nothing to wait for, so the promise stays pending until it is canceled, and awaiting
it hangs by design. Canceling deregisters the request.

```js
import { cancelableFetchLater } from '@cancjs/fetch';

const beacon = cancelableFetchLater('/api/analytics', {
	method: 'POST',
	body: payload,
	activateAfter: 60_000,
});

// The user opted out before it was sent.
beacon.cancel();
```

`cancelableFetchLaterFactory` takes the same configuration as the immediate factory, plus
`fetchLater` and `pollInterval` (how often the activation flag is checked).

### Lazy requests

The `@cancjs/fetch/lazy` entry point returns a
[`CancelableLazyPromise`](../canc-lazy-promise). Nothing is sent until the promise is first
subscribed with `then`, `catch`, `finally` or `await`, and canceling before that skips the request
entirely:

```js
import { cancelableLazyFetch } from '@cancjs/fetch/lazy';

const details = cancelableLazyFetch(`/api/products/${productId}`);

// Prepared while hovering a row, sent only if the row is opened.
if (opened) {
	render(await details);
} else {
	details.cancel(); // no request was ever made
}
```

The lazy `fetchLater` variant defers the registration itself, so no quota is reserved until the
promise is subscribed.

## API

### `@cancjs/fetch`

`cancelableFetch(input, init?)` returns `CancelablePromise<Response>`. Also the default export.

`cancelableFetchFactory(config?)` returns a `cancelableFetch` bound to `config.fetch` and
`config.AbortController`.

`cancelableFetchLater(input, init?)` returns `CancelablePromise<FetchLaterResult>` with an
`activated` property, which is `null` before the request is registered.

`cancelableFetchLaterFactory(config?)` accepts `fetch`, `AbortController`, `fetchLater` and
`pollInterval`.

### `@cancjs/fetch/lazy`

`cancelableLazyFetch(input, init?)`, `cancelableLazyFetchFactory(config?)`,
`cancelableLazyFetchLater(input, init?)`, `cancelableLazyFetchLaterFactory(config?)`. Same
arguments as above, returning `CancelableLazyPromise`.

## Compatibility

Node.js 18 and later, current browsers, TypeScript 4.2 and later. A global `fetch` and
`AbortController` are required unless they are supplied through a factory. `fetchLater` is not
available everywhere, so the deferred variants need either browser support or an implementation
passed to the factory. Everything else follows
[`@cancjs/promise`](../canc-promise#compatibility).

## Documentation

* [`@cancjs/promise`](../canc-promise) for the cancellation model and signal interop
* [`@cancjs/coroutine`](../canc-coroutine) for requests inside a cancelable flow
* [`@cancjs/toolbox`](../canc-toolbox) for timeouts and for making other APIs cancelable
* [examples](../../examples): `demo-fetch` for chains, external signals and timeouts,
	`demo-signal-interop` for the bridges in both directions

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](../../LICENSE)
