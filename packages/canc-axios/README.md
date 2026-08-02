<div align="center">
  <img src="https://raw.githubusercontent.com/cancjs/canc/master/assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<h1 align="center">@cancjs/axios</h1>

<p align="center">
Axios instances whose request methods return cancelable promises.
</p>

---

## Introduction

A drop-in replacement for the axios default export whose request methods return a
`CancelablePromise`. Calling `.cancel()` aborts the request and rejects with a `CancelError`, so
cancellation reads as an ordinary rejection in `try`/`catch`.

The wrapper holds no state of its own. It forwards to a real axios instance, so config merging,
header handling, interceptor chains and `create()` seeding are still axios's own code.

## Features

- same call shapes and signatures as axios, including the full `AxiosResponse` result
- `.cancel()` aborts the in-flight request through an AbortSignal
- cancellation is supported through the full request lifecycle, including interceptors
- a caller-supplied `config.signal` also rejects with a `CancelError`
- instances from `create()` are wrapped too, with their own defaults and interceptors
- works with the xhr, http and fetch adapters, and with axios 0.22 and up
- no Proxy, ES5-friendly output

## Getting Started

### Installation

```sh
npm install @cancjs/axios axios @cancjs/promise
```

`axios` (0.22 or later) and `@cancjs/promise` are peer dependencies. This package is ecosystem
tier: a minor release can carry a breaking change, so pin it with a tilde, `~1.x`, rather than the
default caret. See [Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md)
for the full policy.

### Usage

```js
import cancelableAxios from '@cancjs/axios';
import { isCancelError } from '@cancjs/promise';

const promise = cancelableAxios.get('/issues', { params: { q: 'bug' } });

promise.cancel('superseded');

try {
  const response = await promise;
  console.log(response.data);
} catch (error) {
  if (isCancelError(error)) {
    // the request was aborted
  }
}
```

An instance keeps its own defaults and interceptors, exactly like `axios.create()`:

```js
const api = cancelableAxios.create({ baseURL: 'https://api.example.com' });

api.defaults.headers.common['Authorization'] = 'Bearer token';
```

An axios instance built elsewhere can be wrapped instead:

```js
import axios from 'axios';
import { cancelableAxios } from '@cancjs/axios';

const axiosInstance = axios.create({ baseURL: 'https://api.example.com' });
const api = cancelableAxios.wrap(axiosInstance);
```

In a coroutine the request joins the surrounding cancellation:

```ts
import * as canc from '@cancjs/coroutine';

const loadIssues = canc.async(function* (query: string) {
  const response = yield* canc.await(
    api.get('/issues', { params: { q: query } })
  );
  return response.data;
});

const pending = loadIssues('bug');
pending.cancel(); // aborts the request
```

## How It Works

Each request method (`get`, `post`, `put` and the rest) creates its own `AbortController`, merges
the signal into the request config, and returns a `CancelablePromise`. Canceling the promise
aborts that controller, so axios handles the transport-level abort through whichever adapter it is
using (xhr, http or fetch).

Cancellation is supported through the full lifecycle of a request, not just the network call.
When a request is canceled, interceptors that are still running are canceled too. An interceptor
that returns a cancelable promise has that promise canceled along with the request, so work
started in an interceptor (a token refresh, a retry) does not keep going after the caller has
walked away.

An existing `config.signal` from the caller is composed with the internal one. Either source can
abort the request, and in both cases the promise rejects with a `CancelError`, normalizing the
error regardless of which signal aborted.

The wrapper holds no state beyond what axios itself holds. `defaults` on the wrapper is a live
accessor onto the underlying instance's defaults, and `interceptors` is a facade over the real
interceptor managers, so IDs stay valid and interceptors added directly on the underlying instance
still run. `create()` returns another wrapped instance with its own defaults and interceptors, and
`wrap()` wraps an existing axios instance without creating a new one.

## Description

### Interceptors

Interceptors receive a second argument carrying the cancellation context of the request they run
for. The context exposes `signal`, `isCanceled()`, `cancel()` and `link(promise)`:

```js
api.interceptors.request.use((config, ctx) => {
  if (ctx.isCanceled()) {
    return config;
  }

  return refreshToken({ signal: ctx.signal }).then((token) => {
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
});
```

A cancelable promise returned from an interceptor is canceled along with the request. In the
example above, if the request is canceled while the token refresh is in flight, the refresh
promise is canceled too. `ctx.link(promise)` explicitly ties any cancelable promise to the
request's lifecycle, so work started outside the return path is still canceled with the request.

### Combinators

`all` differs from `axios.all` on purpose: it builds a `CancelablePromise`, so canceling one
request rejects the aggregate and cancels the rest. `spread` is unchanged.

### Accessing the underlying instance

The wrapped instance is reachable as `.axios` when a plain native promise is needed, for example
when handing a request to code that does not understand cancellation.

## API

`cancelableAxios` is both the default export and a named export. It mirrors the full axios
interface: `request`, `get`, `delete`, `head`, `options`, `post`, `put`, `patch`, `getUri`,
`create`, `defaults`, `interceptors`, `all`, `spread`.

`cancelableAxios.create(config?)` returns a new wrapped instance.

`cancelableAxios.wrap(axiosInstance)` wraps an existing axios instance. The argument is
structurally typed, so it accepts instances from any axios version without type conflicts.

`.axios` on any wrapped instance returns the underlying axios instance.

Members axios added after 0.22 (`postForm`, `AxiosHeaders`, `HttpStatusCode` and the rest) are
mirrored only when the installed axios has them.

## Compatibility

Axios 0.22 and later, which is when signal support was added. Node.js 18 and later, current
browsers. Everything else follows
[`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

## Documentation

- [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for the
  cancellation model
- [Coroutines](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine) for using
  axios inside a cancelable flow
- [Examples](https://github.com/cancjs/canc/tree/master/examples): `app-axios` for a side-by-side
  comparison against a manual request registry
- [Repository](https://github.com/cancjs/canc) for the ecosystem overview

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](./LICENSE)
