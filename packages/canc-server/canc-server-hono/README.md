<div align="center">
  <img src="https://raw.githubusercontent.com/cancjs/canc/master/assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<h1 align="center">@cancjs/server-hono</h1>

<p align="center">
Cancel Hono route handlers when the client disconnects or a deadline passes.
</p>

---

## Introduction

A Hono handler keeps running after its client is gone. The database query finishes, the upstream call completes, and the response is serialized for a socket nobody reads. Hono runs on more than one runtime, node among them, and each has its own idea of what "the client left" means.

This package wraps a handler so its work stops when the request does. A generator handler is driven as a coroutine and unwinds at its next `yield`, so `finally` blocks run and downstream work never starts. The same per-request cancel signal is available to anything else scoped to the request, so one client disconnect cancels all of it instead of each layer wiring its own listener.

Cancellation is a `CancelError` rejection from [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise), so ordinary `try`/`catch`/`finally` still describes the control flow.

On `@hono/node-server` the signal is wired from the node response, the same recipe the rest of this family uses. On a Web standard runtime it reads `Request.signal`, which on that side already means the client went away.

## Features

- Handler cancellation on client disconnect, on a deadline, and on a graceful shutdown
- Works on `@hono/node-server` and on Web standard runtimes through the same handler
- One cancel signal per request, shared with request-scoped work started outside the route
- Deadlines as an option rather than a second wrapper, with the response status carried on the error
- Full inference for a bare `function* (c, next)` with no annotations
- Graceful shutdown that lets in-flight handlers finish within a grace window, then cancels the rest
- No runtime dependencies beyond hono itself

## Getting Started

### Installation

```sh
npm install @cancjs/server-hono @cancjs/promise @cancjs/coroutine hono @hono/node-server
```

`@cancjs/promise`, `@cancjs/coroutine`, `hono` and `@hono/node-server` are peer dependencies. `@hono/node-server` is only exercised on the node runtime, but the wrapper detects it at request time rather than at import time, so it is marked as an optional peer. This package is ecosystem tier: a minor release can carry a breaking change, so pin it with a tilde, `~1.4` (pin the minor, not `~1.x`, which npm expands to the same range as `^1`), rather than the default caret. See [Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md) for the full policy.

### Usage

Wrap a route handler and write it as a generator:

```js
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import * as canc from '@cancjs/coroutine';
import { cancelableHandler, cancelErrorHandler } from '@cancjs/server-hono';

const app = new Hono();

app.onError(cancelErrorHandler());

app.get(
  '/invoices/:id',
  cancelableHandler(function* (c) {
    const invoice = yield* canc.await(invoices.findById(c.req.param('id')));
    const lines = yield* canc.await(invoiceLines.findByInvoice(invoice.id));

    return c.json({ ...invoice, lines });
  }),
);

serve({ fetch: app.fetch, port: 3000 });
```

If the client goes away while the first query is running, the second one never starts.

Give a route a deadline:

```js
import { cancelableHandler } from '@cancjs/server-hono';

app.get(
  '/reports/quarterly',
  cancelableHandler(
    function* (c) {
      return c.json(yield* canc.await(reports.quarterly(c.req.query('quarter'))));
    },
    { timeout: { ms: 30_000, status: 504 } },
  ),
);
```

Share the request signal with anything else the request owns. On `@hono/node-server` this is the guarded stand-in for node's own `IncomingMessage.prototype.signal`, which aborts once the request stream finishes reading rather than when the client actually disconnects:

```js
import { getRequestSignal } from '@cancjs/server-hono';

app.get('/exports/ledger', (c) => {
  const em = orm.em.fork({ signal: getRequestSignal(c) });
  // ...
});
```

Shut down gracefully, giving in-flight requests a grace window, passing what `serve()` returned:

```js
import { createShutdown } from '@cancjs/server-hono';

const server = serve({ fetch: app.fetch, port: 3000 });
// right after serve(), so the shutdown knows every connection
const shutdown = createShutdown(server);

process.on('SIGTERM', async () => {
  const { canceled, completed, timedOut } = await shutdown({ timeout: 10_000 });

  logger.info({ canceled, completed, timedOut }, 'server shut down');
  process.exit(0);
});
```

## How It Works

### Two runtimes, one handler

Every call checks whether `@hono/node-server` published its node request and response on the context. When it did, the wrapper wires cancellation from the response, the same `'close'` plus `!writableEnded` recipe as the rest of the family, rather than adopting node's own `IncomingMessage.prototype.signal`: that signal aborts once the request stream finishes reading rather than when the client disconnects, so a body-carrying request would abort on arrival if the wrapper read it directly. When the node pair is absent, the request is running on a Web standard runtime, and the wrapper reads `Request.signal` instead, which does mean disconnect there and needs no guard. Presence of the node pair is the whole check; nothing is compared against a runtime name.

A Web runtime has no response object to hang a settle event off, so the wrapper collects its own teardown callbacks and fires them once when the handler's task settles, in place of the response close event the node path uses.

### Not the platform request signal

Hono does not expose a `request.signal` under that name, so there is nothing here to avoid adopting by that route; on `@hono/node-server` this package still listens on the node response close event rather than the request, for the same reason the node and fastify integrations do.

### The wrapper never writes the response

A cancellation whose client is already gone still has to answer with something, because a Hono handler must resolve to a `Response`. It answers `499`, the status nginx logs for a client that closed the request first, and that response never reaches a reader. When the route wrote the node response itself, as a streaming route does, the `499` carries `x-hono-already-sent` so `@hono/node-server` skips writing it and logs nothing. A deadline is different: the client is still there, so the error is thrown on to `app.onError` instead of being swallowed.

### Status codes need an error handler

Hono does not read a status off a thrown error the way express, fastify and koa do. Without `cancelErrorHandler()` mounted on `app.onError`, a deadline reaches Hono's default handler and answers `500` regardless of the `status` the timeout was given. `cancelErrorHandler()` reads the error itself: a deadline answers with its own status, a shutdown cancellation answers with the fallback status, a departed client gets `499`, and one of Hono's own exceptions (anything with a `getResponse()`) still answers with the response it wanted. Any other error is logged with `console.error` and answered with `500`, as Hono's own default does. Pass `onError` to handle those yourself.

When the response head has already gone out, no status can follow it. On node, `cancelErrorHandler()` destroys the connection in that case, so the client sees an aborted response rather than one that ends cleanly with a truncated body.

## Description

### Handler kinds

A **generator** handler is driven as a coroutine, so a cancellation unwinds it at its current `yield`. This is the flavor with real mid-flight cancellation.

Any **other** handler runs signal-only. The request signal still fires, `onDisconnect` still runs, and a cancelable promise the handler returns is canceled, but a plain `async` body has no suspension points to unwind and runs to completion. That is a real limit, not an oversight: nothing can interrupt an `await` from outside.

### Options

| Option         | Default | Meaning                                                                                                                |
| -------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `timeout`      | none    | Request deadline, one per request. A number is the millisecond shorthand, the object form is `{ ms, status, message }` |
| `signal`       | none    | An external `AbortSignal`, or an array of them, composed alongside the wired one                                       |
| `onDisconnect` | none    | Called once per request when the client goes away. Cleanup and metrics only, the response is unreachable               |
| `onTimeout`    | none    | Called once per request when the deadline fires. The client is still connected                                         |

Cancelable promise flags (`bubble`, `shield`, `strict`, `asyncCancel`, `forceCancelable`) are accepted too and passed to the handler's promise.

Options given to `cancelMiddleware` are inherited by every handler on the request. A route's own options are merged over them key by key.

There is one deadline per request. `cancelMiddleware` starts it when the request reaches the middleware, so it covers plain routes too, and a route passing its own `timeout` restarts the clock with that value. It ends once the handlers below `cancelMiddleware` return, or once a wrapped route settles, so a body streamed after that is not cut short by it. A wrapped middleware that awaits `next()` does not end it early. A slow response body is for the server's own request timeout or the proxy in front of it. The lifecycle callbacks run once per request. A `timeout` of `0` fires at once, and `Infinity`, `NaN`, a negative number or leaving it out sets no deadline. A negative value is not an immediate deadline, and on a route that sets its own `timeout` it lifts the deadline set above it, like `Infinity`. A duration past about 24.8 days is held at that limit.

### Telling a disconnect from a deadline

Both raise a `CancelError`. The discriminator is `isCancelError(error) && !error.timedOut`; a deadline sets `timedOut` through its `TimeoutError` cause. The exported reason strings, `CLIENT_DISCONNECTED`, `SERVER_SHUTDOWN` and `HANDLER_TIMEOUT`, are for logs and for humans reading them, never for branching.

### Shutting down

`createShutdown` takes what `serve()` returned, not the Hono app, and returns the function that runs the shutdown. Call it right after `serve()`: it records connections and requests from that point on.

On node the shutdown stops the server accepting connections, closes the connections that have not sent a request, and closes idle keep-alive sockets. In-flight requests, wrapped or not, keep running for the grace window, and so does a request that arrives on a kept-alive connection meanwhile. Every response sent from then on carries `Connection: close`, and each connection closes as soon as the response on it finishes.

When the window ends, handlers still running are canceled with the shutdown reason, so their cleanup runs and one that has not started its response can still answer `503`. Connections still busy after that are closed. The cancel reaches the request signal too, so work started from `getRequestSignal` and never awaited by the handler stops with the shutdown instead of outliving it.

Pass `cancelOnStart: true` to cancel handlers as soon as the shutdown starts instead, which suits long-lived responses such as server-sent events or long polling that would otherwise hold the whole window.

Created late, it drains correctly but slower, because a connection opened before the call is unknown to it. If that connection has not sent a request yet, or its request is still in flight and no wrapped handler or request signal recorded it, the connection is closed only when the grace window ends. That response goes out without `Connection: close`.

It resolves with counts rather than throwing. A second call while a shutdown is running returns the same promise, so wiring it to both `SIGTERM` and `SIGINT` needs no guard. A call after it has settled starts a new run. Calling `createShutdown` again with the same server returns the same function. There is no shutdown path for a Web standard runtime without a node server object; that deployment shape has no server to stop accepting connections on in the first place.

A `timeout` of `Infinity` waits for the responses however long they take, and a finite one past about 24.8 days is held at that limit.

## API

### Handlers

- `cancelableHandler(handler, options?)` wraps a handler and returns a Hono `Handler`
- `cancelMiddleware(options?)` installs the request signal up front and supplies inherited options
- `cancelErrorHandler(options?)` maps a cancellation to a response, mounted with `app.onError`

### Request signal

- `getRequestSignal(c)` returns the request's `CancelSignal`, installing it on first use. On `@hono/node-server` it is the guarded replacement for node's own `IncomingMessage.prototype.signal`, which aborts once the request stream finishes reading rather than when the client disconnects, so it fires on a healthy in-flight request the moment its body has been consumed.

### Shutdown

- `createShutdown(server)` returns `shutdown(options?)`, which lets in-flight handlers finish within the grace window, cancels the rest, and resolves with `{ canceled, completed, timedOut }`. Options: `timeout`, `reason`, `closeServer`, `cancelOnStart`

### Reasons

- `CLIENT_DISCONNECTED`, `SERVER_SHUTDOWN`, `HANDLER_TIMEOUT`

### Types

- `ICancelableHandlerOptions`, `ICancelContext`, `ICancelErrorHandlerOptions`, `IShutdownOptions`, `IShutdownResult`, `THonoHandler`, `TTimeoutOption`

## Compatibility

Node.js 18 and later, Hono 4 and later, `@hono/node-server` 1 and later, TypeScript 4.2 and later. Requires `@cancjs/promise >=1.1.0` and `@cancjs/coroutine >=1.0.0` as peer dependencies. Everything else follows [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

Tested against `@hono/node-server`. Other Web standard runtimes (Cloudflare Workers, Deno, Bun's fetch handler) take the `Request.signal` path and are not independently verified here; their own disconnect-signal reliability is a property of the runtime, not of this package.

HTTP/1.1 and HTTPS only. HTTP/2 is not supported yet.

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
