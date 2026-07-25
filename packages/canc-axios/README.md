<p align="center">
 <img src="../../assets/canc-logo.png" width="483" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; a crafty foundation for cancelable promises">
</p>

<h1 align="center">@cancjs/axios</h1>

<p align="center">
 <a href="../../LICENSE">
 <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
</p>

---
## Introduction

A drop-in replacement for the axios default export whose request methods return a
CancelablePromise. Calling `.cancel()` aborts the request and rejects with a `CancelError`, so
cancellation reads as an ordinary rejection in `try`/`catch`.

The wrapper holds no state of its own. It forwards to a real axios instance, so config merging,
header handling, interceptor chains and `create()` seeding are still axios's own code.

## Features

- same call shapes and signatures as axios, including the full `AxiosResponse` result
- `.cancel()` aborts the in-flight request through an AbortSignal
- a caller-supplied `config.signal` also rejects with a `CancelError`
- interceptors receive a cancel context, and a cancelable promise they return is canceled with the
  request
- instances from `create()` are wrapped too, with their own defaults and interceptors
- works with the xhr, http and fetch adapters, and with axios 0.22 and up
- no Proxy, ES5-friendly output

## Getting Started

### Installation

#### NPM

```
npm i -S @cancjs/axios
```

#### Yarn

```
yarn add @cancjs/axios
```

Requires `axios` (0.22 or later) and `@cancjs/promise` alongside it.

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

const api = cancelableAxios.wrap(axios.create({ baseURL: 'https://api.example.com' }));
```

Interceptors get a second argument carrying the cancellation of the request they run for. A
cancelable promise returned from an interceptor is canceled along with the request:

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

## Documentation

Members axios added after 0.22 (`postForm`, `AxiosHeaders`, `HttpStatusCode` and the rest) are
mirrored only when the installed axios has them.

`all` differs from `axios.all` on purpose: it builds a `CancelablePromise`, so canceling one
request rejects the aggregate. `spread` is unchanged.

The wrapped instance is reachable as `.axios` when a plain native promise is wanted.

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](LICENSE)