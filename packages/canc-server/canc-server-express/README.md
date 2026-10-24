<div align="center">
  <img src="https://raw.githubusercontent.com/cancjs/canc/master/assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<h1 align="center">@cancjs/server-express</h1>

<p align="center">
Express handler wrapper that cancels in-flight work when the client disconnects or a deadline passes.
</p>

---

## Introduction

An express handler keeps running after its client is gone. The query still hits the database, the upstream call still costs money, and the result is written to a socket nobody reads. Express has no way to tell a handler that the request it serves no longer matters.

This package wraps a handler so its work stops when the request does. A generator handler is driven as a coroutine and unwinds at its next `yield`, so `finally` blocks run and downstream work never starts. The same per-request cancel signal is available to anything else scoped to the request, a database context or a background job handle, so one client disconnect cancels all of it instead of each layer wiring its own listener.

Cancellation is a `CancelError` rejection from [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise), so ordinary `try`/`catch`/`finally` still describes the control flow.

## Features

- Handler cancellation on client disconnect, on a deadline, and on a graceful shutdown
- One cancel signal per request, shared with request-scoped work started outside the route
- Deadlines as an option rather than a second wrapper, with the HTTP status carried on the error
- Full express handler typings, including a bare `function* (req, res)` with no annotations
- Graceful shutdown that lets in-flight handlers finish within a grace window, then cancels the rest
- Opt-in error handler, so a canceled request answers correctly in one line
- No runtime dependencies

## Getting Started

### Installation

```sh
npm install @cancjs/server-express @cancjs/promise @cancjs/coroutine express
```

`@cancjs/promise`, `@cancjs/coroutine` and `express` are peer dependencies. This package is ecosystem tier: a minor release can carry a breaking change, so pin it with a tilde, `~1.4` (pin the minor, not `~1.x`, which npm expands to the same range as `^1`), rather than the default caret. See [Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md) for the full policy.

### Usage

Wrap a route handler and write it as a generator:

```js
import * as canc from '@cancjs/coroutine';
import { cancelableHandler } from '@cancjs/server-express';

app.get(
  '/invoices/:id',
  cancelableHandler(function* (req, res) {
    const invoice = yield* canc.await(invoices.findById(req.params.id));
    const lines = yield* canc.await(invoiceLines.findByInvoice(invoice.id));

    res.json({ ...invoice, lines });
  }),
);
```

If the client goes away while the first query is running, the second one never starts.

Give a route a deadline, and answer it with the opt-in error handler:

```js
import { cancelableHandler, cancelErrorHandler } from '@cancjs/server-express';

app.get(
  '/reports/quarterly',
  cancelableHandler(
    function* (req, res) {
      res.json(yield* canc.await(reports.quarterly(req.query.quarter)));
    },
    { timeout: { ms: 30_000, status: 504 } },
  ),
);

// after every route
app.use(cancelErrorHandler());
```

Apply the same options to a whole router, and let one route opt out:

```js
import { cancelMiddleware } from '@cancjs/server-express';

router.use(cancelMiddleware({ timeout: 10_000 }));
router.get('/exports/ledger', cancelableHandler(streamLedger, { timeout: 120_000 }));
```

If `streamLedger` has already started writing when the deadline hits, the status line is gone and cannot change. The connection is destroyed instead, so the client sees an aborted response and never mistakes a cut export for a complete one.

Share the request signal with anything else the request owns. This is the guarded stand-in for node's own `IncomingMessage.prototype.signal`, which aborts once the request stream finishes reading rather than when the client actually disconnects:

```js
import { getRequestSignal } from '@cancjs/server-express';

app.use((req, res, next) => {
  req.orm = orm.em.fork({ signal: getRequestSignal(req, res) });
  next();
});
```

Shut the server down, giving in-flight requests a grace window:

```js
import { createShutdown } from '@cancjs/server-express';

const server = app.listen(3000);
// right after listen(), so the shutdown knows every connection
const shutdown = createShutdown(server);

process.on('SIGTERM', async () => {
  const { canceled, completed, timedOut } = await shutdown({ cancelAfter: 10_000 });

  logger.info({ canceled, completed, timedOut }, 'server shut down');
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

This matters more than it looks. `IncomingMessage` `'close'` means the request stream completed, which for a body-carrying POST behind `express.json()` happens at the very start of the handler with the client still connected. Wiring cancellation to the request would cancel every such request on arrival. `ServerResponse` `'close'` means the response completed or the connection died early, and `writableEnded` is what separates those two. A pre-flight check on `!res.writableEnded && (res.destroyed || !res.writable)` covers a client that left before the route was reached, because a request-side check cancels a healthy request on arrival.

The same reason applies to the request signals the platform offers. Node's `IncomingMessage.prototype.signal` and fastify's `request.signal` are both an unguarded `'close'` listener, so neither is adopted here. An external signal is composed in only when you pass one through the `signal` option.

### Not the platform request signal

Node's `request.signal` aborts when the request stream ends, not when the client disconnects. With a body parser on a POST that happens before the handler runs, so work started from that signal is canceled immediately. This package listens on the response instead, and only treats a close as a disconnect while the response has not finished writing.

### Handler kinds

The handler kind is read from what it returns, not from how it was declared.

A **generator** handler is driven as a coroutine, so a cancellation unwinds it at its current `yield`. This is the flavor with real mid-flight cancellation.

Any **other** handler runs signal-only. The request signal still fires, `onDisconnect` still runs, and a cancelable promise the handler returns is canceled, but a plain `async` body has no suspension points to unwind and runs to completion. That is a real limit, not an oversight: nothing can interrupt an `await` from outside.

### Deadlines

A deadline aborts the request signal itself rather than the handler's promise, so request-scoped work other consumers started stops with the handler instead of outliving it. The resulting `CancelError` reports `timedOut === true` and carries `status` and `statusCode`, which is what express reads when it picks a response code.

There is one deadline per request. `cancelMiddleware` starts it when the request reaches the middleware, so it applies to plain routes too. On one, the deadline aborts the request signal and runs `onTimeout`, and the route itself still answers. A route passing its own `timeout` restarts the clock with that value, longer or shorter. `timeout: Infinity` lifts it for that route. The deadline covers the handler, not the body. It ends once the wrapped handler answering the request settles, so a stream still being written after the handler returned is not cut short by it. A handler that answers from a callback after it returned is no longer covered either. A slow response body is for `server.requestTimeout` or the proxy in front of the server. A wrapped middleware that called `next()` does not end it, and on a plain route it runs until the response finishes, so `onTimeout` can run while the body is still being written. A `timeout` of `0` fires at once, and `Infinity`, `NaN`, a negative number or leaving it out sets no deadline. A negative value is not an immediate deadline, and on a route that sets its own `timeout` it lifts the deadline set above it, like `Infinity`. A duration past about 24.8 days is held at that limit.

### Shutting down

`createShutdown(server)` returns the function that runs the shutdown. Call it right after `listen()`: it records connections and requests from that point on. It replaces the prerelease `shutdown(server, o)`: call `createShutdown(server)(o)`.

The shutdown stops the server accepting connections, closes a connection that has received no bytes once it is five seconds old (or at the grace, if shorter), leaves one that has already sent part of a request to finish, and closes idle keep-alive sockets. In-flight requests, wrapped or not, keep running for the grace window, and so does a request that arrives on a kept-alive connection meanwhile. Every response sent from then on carries `Connection: close`, and each connection closes as soon as the response on it finishes.

When the window ends, handlers still running are canceled with the shutdown reason, so their cleanup runs and one that has not started its response can still answer `503`. A request still open then runs until it finishes or `closeAfter`, and connections still busy at `closeAfter` are closed. Shutdown resolves as soon as nothing is open. On Kubernetes, keep `closeAfter` at or below `terminationGracePeriodSeconds` minus the preStop sleep, less a margin for the process to exit, or the kubelet kills the process before the window ends. A `cancelAfter` greater than `closeAfter` throws a `RangeError` synchronously; negative values clamp to 0 before that check. The cancel reaches the request signal too, so work started from `getRequestSignal` and never awaited by the handler stops with the shutdown instead of outliving it.

`status` and `headers` set the answer each request the shutdown cancels gets, for example `shutdown({ cancelAfter: 10_000, status: 504, headers: { 'Retry-After': '5' } })`. For these cancellations `status` takes precedence over a handler's `status` option, and `headers` are added to the answer. A deadline keeps the status it was given. Invalid values throw from `shutdown()`: a `status` outside 100 to 599 raises a `RangeError`, and a header name or value HTTP does not allow raises a `TypeError`.

To add a header to a shutdown answer, set `err.headers` in your own error middleware; express applies it. A shutdown cancel and a disconnect both reach a handler as a cancellation, so test `err.status` to tell them apart, since `!err.timedOut` alone matches both. Retry only idempotent requests, because the handler may have partly run. An abort that a library wraps in its own error answers the framework's 500, for a deadline or a shutdown alike.

Pass `cancelAfter: 0` to cancel handlers as soon as the shutdown starts instead, which suits long-lived responses such as server-sent events or long polling that would otherwise hold the whole window.

Created late, it finishes correctly but slower, because a connection opened before the call is unknown to it. If that connection has not sent a request yet, or its request is still in flight and no wrapped handler or request signal recorded it, the connection is closed only when `closeAfter` ends. That response goes out without `Connection: close`.

It resolves with counts rather than throwing. A second call while a shutdown is running returns the same promise, so wiring it to both `SIGTERM` and `SIGINT` needs no guard. A call after it has settled starts a new run. Calling `createShutdown` again with the same server returns the same function.

Migrating from `timeout`: rename it to `cancelAfter`. `cancelOnStart: true` becomes `cancelAfter: 0`, and without `closeAfter` the window is then 1 s instead of 10 s, so pass `closeAfter` to keep a longer one. The value is set once per server, so an app that mixes long-lived streams with ordinary routes ends its own streams when the shutdown starts and keeps the default for the rest.

A `cancelAfter` of `Infinity` waits for the responses however long they take, and a finite one past about 24.8 days is held at that limit.

## Description

### Cancellation reasons

Cancellation is always a `CancelError`. What differs between the three triggers is the reason it carries, exported as `CLIENT_DISCONNECTED`, `SERVER_SHUTDOWN` and `HANDLER_TIMEOUT`. Those strings are for logs and humans. Code discriminates with `isCancelError(err) && !err.timedOut`, never with a message comparison and never with `instanceof`.

### What reaches the error handler

The wrapper forwards errors to express with `next(err)`, with two exceptions. A cancellation that is not a deadline, on a response whose socket is already gone, is dropped: there is nobody left to answer, and forwarding it only makes the default handler log the request and write to a dead socket. A deadline always reaches the error handler, because the client is still there and expects a response. The other exception: a request forwards one cancellation at most. A deadline cancels a wrapped middleware still running after `next()` together with the route behind it, and only the first of the two reaches the error handlers. A second `next(err)` would skip past `cancelErrorHandler` into express's final handler and log a stack for a request that was already answered.

`cancelErrorHandler()` is opt-in and mounted after the routes. It answers a deadline with the status stamped on the error, answers a shutdown cancellation with its fallback status (`503`, or whatever `status` you pass), leaves a departed client alone, and passes anything that is not a cancellation straight through.

Mount it after your own error handlers: express calls them in order, and each one that calls `next(err)` passes the cancellation on. A cancellation answer also drops the `Content-Type`, `Content-Encoding`, `Content-Language` and `Content-Range` the route set, and sends the cancellation's headers only when the status came from the error. Put a `Retry-After` on a deadline with `timeout: { ms, headers: { 'Retry-After': '5' } }`. To log cancellations you care about, filter with `isCancelError` in your own handler before calling `next(err)`. A late failure after the deadline is logged once outside the test environment.

### Options

| Option         | Default | Meaning                                                                                                                |
| -------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `timeout`      | none    | Request deadline, one per request. A number is the millisecond shorthand, the object form is `{ ms, status, message }` |
| `signal`       | none    | An external `AbortSignal`, or an array of them, composed alongside the wired one                                       |
| `onDisconnect` | none    | Called once per request when the client goes away. Cleanup and metrics only, the response is unreachable               |
| `onTimeout`    | none    | Called once per request when the deadline fires. The client is still connected                                         |

Cancelable promise flags (`bubble`, `shield`, `strict`, `asyncCancel`, `forceCancelable`) are accepted too and passed to the handler's promise.

Options given to `cancelMiddleware` are inherited by every handler on the request. A route's own options are merged over them key by key, so a router-wide deadline and a per-route override compose the way you would expect. The lifecycle callbacks run once per request, however many wrapped layers it passes through.

## API

### Handlers

- `cancelableHandler(handler, options?)` wraps a handler and returns an express `RequestHandler`
- `cancelMiddleware(options?)` installs the request signal up front and supplies inherited options
- `cancelErrorHandler(options?)` maps a cancellation to a response, mounted after the routes

### Request signal

- `getRequestSignal(req, res)` returns the request's `CancelSignal`, installing it on first use. It is the guarded replacement for node's own `IncomingMessage.prototype.signal`, which aborts once the request stream finishes reading rather than when the client disconnects, so it fires on a healthy in-flight request the moment its body has been consumed.

### Shutdown

- `createShutdown(server)` returns `shutdown(options?)`, which lets in-flight handlers finish until `cancelAfter`, cancels the rest, and resolves with `{ canceled, completed, timedOut }` once they answer or `closeAfter` ends the window. `canceled` counts requests this shutdown canceled, `completed` requests that finished normally, and `timedOut` is set when `closeAfter` ends the window with a request or connection still open. Options: `cancelAfter`, `closeAfter`, `reason`, `closeServer`, `status`, `headers`

### Reasons

- `CLIENT_DISCONNECTED`, `SERVER_SHUTDOWN`, `HANDLER_TIMEOUT`

### Types

- `ICancelableHandlerOptions`, `ICancelErrorHandlerOptions`, `IShutdownOptions`, `IShutdownResult`

### Readiness and websockets

Node does not list a websocket as a connection once it is upgraded, so `shutdown()` cannot close it with a close frame. Once the window ends it destroys the socket without one, which the client sees as code `1006` (abnormal closure). Close your websockets yourself when shutdown starts, with code `1001` (going away), and let the shutdown wait for them:

```ts
await Promise.all([closeWebSockets(1001), shutdown({ cancelAfter: 5_000 })]);
```

Any upgraded socket still open once the window ends is destroyed. To keep new traffic away first, fail your readiness check and wait a few seconds before calling `shutdown()`. In Kubernetes a `preStop` sleep does the same job.

## Compatibility

Node.js 18 and later, express 4.18 and later (including express 5), TypeScript 4.2 and later. Requires `@cancjs/promise >=1.1.0` and `@cancjs/coroutine >=1.0.0` as peer dependencies. Everything else follows [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

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
