<div align="center">
  <img src="https://raw.githubusercontent.com/cancjs/canc/master/assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<h1 align="center">@cancjs/server-node</h1>

<p align="center">
Raw node:http handler wrapper that cancels in-flight work when the client disconnects or a deadline passes.
</p>

---

## Introduction

A raw `node:http` request listener keeps running after its client is gone. The query still hits the database, the upstream call still costs money, and the result is written to a socket nobody reads. Node has no way to tell a handler that the request it serves no longer matters.

This package wraps a `(req, res)` handler so its work stops when the request does. A generator handler is driven as a coroutine and unwinds at its next `yield`, so `finally` blocks run and downstream work never starts. The same per-request cancel signal is available to anything else scoped to the request, a database context or a background job handle, so one client disconnect cancels all of it instead of each layer wiring its own listener.

Cancellation is a `CancelError` rejection from [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise), so ordinary `try`/`catch`/`finally` still describes the control flow.

This package targets `http.createServer` directly, with no framework in between. It is also the answer for anything that hands you a raw `(req, res)` pair with its own error pipeline: restify, AdonisJS, a Next.js Pages Router API route, or Nest running on the raw adapter instead of express.

## Features

- Handler cancellation on client disconnect, on a deadline, and on a graceful shutdown
- One cancel signal per request, shared with request-scoped work started outside the handler
- Deadlines as an option rather than a second wrapper, with the HTTP status carried on the error
- Full inference for a bare `function* (req, res)` with no annotations
- Graceful drain that cancels in-flight handlers and reports what happened
- An `onError` option, so a canceled request answers correctly with no extra wiring
- No runtime dependencies

## Getting Started

### Installation

```sh
npm install @cancjs/server-node @cancjs/promise @cancjs/coroutine
```

`@cancjs/promise` and `@cancjs/coroutine` are peer dependencies. This package is ecosystem tier: a minor release can carry a breaking change, so pin it with a tilde, `~1.4` (pin the minor, not `~1.x`, which npm expands to the same range as `^1`), rather than the default caret. See [Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md) for the full policy.

### Usage

Wrap a handler and write it as a generator:

```js
import * as canc from '@cancjs/coroutine';
import { cancelableHandler } from '@cancjs/server-node';
import { createServer } from 'http';

const server = createServer(
  cancelableHandler(function* (req, res) {
    const invoice = yield* canc.await(invoices.findById(idFromUrl(req.url)));
    const lines = yield* canc.await(invoiceLines.findByInvoice(invoice.id));

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ...invoice, lines }));
  }),
);

server.listen(3000);
```

If the client goes away while the first query is running, the second one never starts.

Give a handler a deadline. Raw node has no error middleware, so the status is answered through the default `onError`, which is `cancelErrorHandler()`:

```js
import { cancelableHandler } from '@cancjs/server-node';

const handler = cancelableHandler(
  function* (req, res) {
    res.end(JSON.stringify(yield* canc.await(reports.quarterly(quarterFromUrl(req.url)))));
  },
  { timeout: { ms: 30_000, status: 504 } },
);
```

Route errors somewhere else, for a framework-less server that already has its own error pipeline:

```js
import { cancelableHandler } from '@cancjs/server-node';

const handler = cancelableHandler(routeHandler, {
  onError: (error, req, res) => myErrorPipeline.handle(error, req, res),
  timeout: 10_000,
});
```

Share the request signal with anything else the request owns:

```js
import { getRequestSignal } from '@cancjs/server-node';

const handler = cancelableHandler(function* (req, res) {
  const em = orm.em.fork({ signal: getRequestSignal(req, res) });
  // ...
});
```

Drain in-flight requests on shutdown:

```js
import { drain } from '@cancjs/server-node';

const server = createServer(handler).listen(3000);

process.on('SIGTERM', async () => {
  const { canceled, completed, timedOut } = await drain(server, { timeout: 10_000 });

  logger.info({ canceled, completed, timedOut }, 'server drained');
  process.exit(0);
});
```

## How It Works

### Where the disconnect comes from

The signal is wired from the **response**, not the request, and it fires only when the response has not finished:

```js
res.once('close', () => {
  if (!res.writableEnded) cancel();
});
```

This matters more than it looks. `IncomingMessage` `'close'` means the request stream completed, which for a body-carrying POST happens once the body is read, with the client still connected. Wiring cancellation to the request would cancel every such request on arrival. `ServerResponse` `'close'` means the response completed or the connection died early, and `writableEnded` is what separates those two. A pre-flight check on `res.destroyed && !res.writableEnded` covers a client that left before the handler was reached, because a request-side check cancels a healthy request on arrival.

The same reason applies to the request signal node itself offers. `IncomingMessage.prototype.signal` is an unguarded `'close'` listener, so it is deliberately not adopted here. An external signal is composed in only when you pass one through the `signal` option.

### Handler kinds

The handler kind is read from what it returns, not from how it was declared.

A **generator** handler is driven as a coroutine, so a cancellation unwinds it at its current `yield`. This is the flavor with real mid-flight cancellation.

Any **other** handler runs signal-only. The request signal still fires, `onDisconnect` still runs, and a cancelable promise the handler returns is canceled, but a plain `async` body has no suspension points to unwind and runs to completion. That is a real limit, not an oversight: nothing can interrupt an `await` from outside.

### Deadlines

A deadline aborts the request signal itself rather than the handler's promise, so request-scoped work other consumers started stops with the handler instead of outliving it. The resulting `CancelError` reports `timedOut === true` and carries `status` and `statusCode`, which is what the default `onError` reads when it picks a response code.

### Draining

`drain` stops the server accepting connections, closes idle keep-alive sockets, cancels every in-flight handler, then waits for them within a grace window before closing what is left. It cancels the request signal too, so work started from `getRequestSignal` and never awaited by the handler stops with the shutdown instead of outliving it. It resolves with counts rather than throwing, and a second call while the first is running returns the same result, so wiring it to both `SIGTERM` and `SIGINT` needs no guard.

## Description

### Cancellation reasons

Cancellation is always a `CancelError`. What differs between the three triggers is the reason it carries, exported as `CLIENT_DISCONNECTED`, `SERVER_SHUTDOWN` and `HANDLER_TIMEOUT`. Those strings are for logs and humans. Code discriminates with `isCancelError(err) && !err.timedOut`, never with a message comparison and never with `instanceof`.

### What reaches the error handler

Raw node has no `next(err)` and no error middleware. What settles a request after its handler rejects is `options.onError`, and it defaults to `cancelErrorHandler()`. A cancellation that is not a deadline, on a response whose socket is already gone, is dropped before `onError` is called: there is nobody left to answer. A deadline always reaches `onError`, because the client is still there and expects a response.

`cancelErrorHandler()` answers a deadline with the status stamped on the error, answers a shutdown cancellation with its fallback status (`503`, or whatever `status` you pass), leaves a departed client alone, and rethrows anything that is not a cancellation. Nothing awaits that throw, so it surfaces as an unhandled rejection instead of being silently dropped, which is the closest raw node comes to "forward it".

Pass your own `onError` when a caller already has an error pipeline: an adapter for restify, AdonisJS, a Pages Router API route, or Nest on the raw server reads the error from there instead.

### Options

| Option         | Default                | Meaning                                                                                               |
| -------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `timeout`      | none                   | Handler deadline. A number is the millisecond shorthand, the object form is `{ ms, status, message }` |
| `signal`       | none                   | An external `AbortSignal`, or an array of them, composed alongside the wired one                      |
| `onDisconnect` | none                   | Called once when the client goes away. Cleanup and metrics only, the response is unreachable          |
| `onTimeout`    | none                   | Called once when the deadline fires. The client is still connected                                    |
| `onError`      | `cancelErrorHandler()` | Called with `(error, req, res)` for anything the wrapper does not swallow                             |

Cancelable promise flags (`bubble`, `shield`, `strict`, `asyncCancel`, `forceCancelable`) are accepted too and passed to the handler's promise.

## API

### Handlers

- `cancelableHandler(handler, options?)` wraps a `(req, res)` handler and returns a plain node request listener
- `cancelErrorHandler(options?)` maps a cancellation to a response; the default `onError`

### Request signal

- `getRequestSignal(req, res)` returns the request's `CancelSignal`, installing it on first use

### Shutdown

- `drain(server, options?)` cancels in-flight handlers and resolves with `{ canceled, completed, timedOut }`

### Reasons

- `CLIENT_DISCONNECTED`, `SERVER_SHUTDOWN`, `HANDLER_TIMEOUT`

## Compatibility

Node.js 18 and later, TypeScript 4.2 and later. Requires `@cancjs/promise >=1.0.0` and `@cancjs/coroutine >=1.0.0` as peer dependencies. Everything else follows [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

## Documentation

- [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for core cancellation semantics and `CancelError`
- [`@cancjs/coroutine`](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine) for the generator flavor used in every sample here
- [Server integration recipes](https://github.com/cancjs/canc/blob/master/docs/server-recipes.md) for frameworks with no package of their own
- [Root README](https://github.com/cancjs/canc/blob/master/README.md) for monorepo overview
- [Examples](https://github.com/cancjs/canc/tree/master/examples) for application integration samples

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](./LICENSE)
