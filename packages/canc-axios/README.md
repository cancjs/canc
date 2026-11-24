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
`CancelablePromise`. Calling `.cancel()` rejects with a `CancelError` and aborts cooperative
transport when Canc's signal is retained, so cancellation reads as an ordinary rejection in
`try`/`catch`.

The wrapper holds no state of its own. It forwards to a real axios instance, so config merging,
header handling, interceptor chains and `create()` seeding are still axios's own code.

## Features

- same call shapes and signatures as axios, including the full `AxiosResponse` result
- `.cancel()` rejects promptly and aborts cooperative transport through the retained signal
- cancellation is supported through the full request lifecycle, including interceptors
- cancellation through the final Axios signal is normalized to a `CancelError`
- instances from `create()` are wrapped too, with their own defaults and interceptors
- works with the xhr, http and fetch adapters, and with axios 0.22 and up
- no Proxy, ES5-friendly output

## Getting Started

### Installation

```sh
npm install @cancjs/axios axios @cancjs/promise @cancjs/toolbox
```

`axios` (0.22 or later), `@cancjs/promise` and `@cancjs/toolbox` are peer dependencies. This package is ecosystem
tier: a minor release can carry a breaking change, so pin it with a tilde, `~1.4` (pin the minor, not
`~1.x`, which npm expands to the same range as `^1`), rather than the default caret. See
[Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md) for the full policy.

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

The default export and the named `cancelableAxios` export are the same binding, so
`import cancelableAxios from '@cancjs/axios'` and `import { cancelableAxios } from '@cancjs/axios'`
give you the identical object. Pick whichever reads better next to your existing axios import.

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

Each request method (`get`, `post` and the rest) creates its own `AbortController` and returns a
`CancelablePromise`. Calling `.cancel()` rejects the promise promptly and cancels linked work,
even if the adapter ignores the signal. With Canc's signal retained, it also aborts cooperative
transport through the Axios adapter (xhr, http or fetch).

A supplied request signal overrides the instance default. An omitted or `undefined` signal
inherits the default; in JavaScript, `null` clears it. Canc composes that signal with its
controller before passing the config to Axios.

Axios uses the final `config.signal` after request interceptors run. Aborting an earlier signal
does not reject the request if an interceptor replaces it before dispatch. External abort depends
on the final signal and adapter cooperation. A signal-ignoring adapter may stay pending, and an
external abort after the adapter succeeds need not reject a pending response interceptor.

Native cancellation errors become a `CancelError`. If the adapter exposes the final signal,
Canc can preserve its abort or timeout reason as the cause. Axios 0.22's HTTP adapter does not
expose this information in its native cancellation error, so the original signal reason and
timeout or abort flags may be unavailable. Listeners are detached on settlement or abort.

With `responseType: 'stream'` the promise fulfills at the response headers, so the body is still
readable afterwards. The request stays abortable until the stream ends or closes: aborting the
final signal, or calling `response.config.cancelScope.cancel()`, destroys the stream. A consumer
that listens for errors (`for await`, `pipeline`, an `'error'` handler) sees the `CancelError`.
A stream without an error listener is destroyed quietly.

The wrapper holds no state beyond what axios itself holds. `defaults` on the wrapper is a live
accessor onto the underlying instance's defaults, and `interceptors` is a facade over the real
interceptor managers, so IDs stay valid and interceptors added directly on the underlying instance
still run. `create()` returns another wrapped instance with its own defaults and interceptors, and
`wrap()` wraps an existing axios instance without creating a new one.

## Description

### Interceptors

Return a cancelable promise from an interceptor to link its work to the request. Adapt a
signal-only dependency once at its boundary, for example a token refresh using Fetch:

```js
import { cancelify } from '@cancjs/toolbox';

const refreshToken = cancelify(({ signal }) =>
  fetch('/auth/refresh', { signal }).then((response) => {
    if (!response.ok) throw new Error('Token refresh failed');
    return response.text();
  })
);

api.interceptors.request.use((config) =>
  refreshToken().then((token) => {
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  })
);
```

Canceling the request cancels the returned refresh promise too. Interceptors receive a second
argument, the cancellation context, which exposes `signal`, `isCanceled()`, `cancel()` and
`link(promise)`. Use `ctx.link(work)` for independently started cancelable work and `ctx.signal`
for direct integration with a signal-only API.

**Signal replacement:** Assigning `config.signal = replacement.signal` inside a request
interceptor replaces the existing transport signal, including Canc's composed signal. This is
standard Axios behavior. Calling `job.cancel()` still rejects the Canc promise and cancels its
linked work, but the HTTP request may continue. Prefer returned or linked cancelable promises
for interceptor work.

For multiple-signal interoperability, runtimes supporting `AbortSignal.any()` can combine the
existing transport signal with an additional one, rather than replacing it.

An interceptor that unwraps the response (`(response) => response.data`) still hands the next
interceptor the live context, because the returned object is remembered for its request. The next
interceptor gets a detached context (`signal` is `undefined`, `cancel()` does nothing) when the
previous one returned a primitive, a value it resolved from a promise, or an object that another
request also returned. The request itself still follows its effective signal.

### Combinators

`all` differs from `axios.all` on purpose: it builds a `CancelablePromise`. Canceling the aggregate
releases its requests. A request the aggregate holds alone is canceled, and a request that other
code also consumes keeps running for that code. `spread` is unchanged.

### Accessing the underlying instance

The wrapped instance is reachable as `.axios` when a plain native promise is needed, for example
when handing a request to code that does not understand cancellation.

### Declared failures

Request methods on wrapped axios instances declare `AxiosError` in an open failure set (`CancelablePromise<AxiosResponse<T>, AxiosError<T> | Unlisted>`). A `catch` reason stays `any`, the same as on a plain axios promise, and `isAxiosError` narrows it.

When a request is canceled by the caller, the returned promise rejects with a `CancelError`. Cancellation is handled separately from the application failure set. See [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for declared failure matching and filtering.

## API

`cancelableAxios` is both the default export and a named export (both references point to the same instance). It mirrors the full axios
interface: `request`, `get`, `delete`, `head`, `options`, `post`, `put`, `patch`, `getUri`,
`create`, `defaults`, `interceptors`, `all`, `spread`.

`cancelableAxios.create(config?)` returns a new wrapped instance.

`cancelableAxios.wrap(axiosInstance)` and `wrapAxios(axiosInstance)` wrap an existing axios instance. The argument is
structurally typed, so it accepts instances from any axios version without type conflicts. The
options accept `AbortController` only. A `lazy` option is no longer accepted by the type, and it
never had an effect: requests always started at once.

`CancelScope` is the per-request cancellation scope class managing request lifecycle and interceptor promises.

`.axios` on any wrapped instance returns the underlying axios instance.

Members axios added after 0.22 (`postForm`, `putForm`, `patchForm`, `AxiosHeaders`, `HttpStatusCode` and the rest) plus standard axios exports (`AxiosError`, `CancelToken`, `CanceledError`, `isAxiosError`, `VERSION`, `formToJSON`, `getAdapter`, `mergeConfig`, `toFormData`) are re-exported.

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
