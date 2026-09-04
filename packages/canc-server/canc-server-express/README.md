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
- Graceful shutdown that cancels in-flight handlers and reports what happened
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

Share the request signal with anything else the request owns. This is the guarded stand-in for node's own `IncomingMessage.prototype.signal`, which aborts once the request stream finishes reading rather than when the client actually disconnects:

```js
import { getRequestSignal } from '@cancjs/server-express';

app.use((req, res, next) => {
  req.orm = orm.em.fork({ signal: getRequestSignal(req, res) });
  next();
});
```

Shut the server down, canceling in-flight requests:

```js
import { shutdown } from '@cancjs/server-express';

const server = app.listen(3000);

process.on('SIGTERM', async () => {
  const { canceled, completed, timedOut } = await shutdown(server, { timeout: 10_000 });

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

### Handler kinds

The handler kind is read from what it returns, not from how it was declared.

A **generator** handler is driven as a coroutine, so a cancellation unwinds it at its current `yield`. This is the flavor with real mid-flight cancellation.

Any **other** handler runs signal-only. The request signal still fires, `onDisconnect` still runs, and a cancelable promise the handler returns is canceled, but a plain `async` body has no suspension points to unwind and runs to completion. That is a real limit, not an oversight: nothing can interrupt an `await` from outside.

### Deadlines

A deadline aborts the request signal itself rather than the handler's promise, so request-scoped work other consumers started stops with the handler instead of outliving it. The resulting `CancelError` reports `timedOut === true` and carries `status` and `statusCode`, which is what express reads when it picks a response code.

### Shutting down

`shutdown` stops the server accepting connections, closes idle keep-alive sockets, cancels every in-flight handler, then waits for them within a grace window before closing what is left. It cancels the request signal too, so work started from `getRequestSignal` and never awaited by the handler stops with the shutdown instead of outliving it. It resolves with counts rather than throwing, and a second call while the first is running returns the same result, so wiring it to both `SIGTERM` and `SIGINT` needs no guard.

## Description

### Cancellation reasons

Cancellation is always a `CancelError`. What differs between the three triggers is the reason it carries, exported as `CLIENT_DISCONNECTED`, `SERVER_SHUTDOWN` and `HANDLER_TIMEOUT`. Those strings are for logs and humans. Code discriminates with `isCancelError(err) && !err.timedOut`, never with a message comparison and never with `instanceof`.

### What reaches the error handler

The wrapper forwards errors to express with `next(err)`, with one exception. A cancellation that is not a deadline, on a response whose socket is already gone, is dropped: there is nobody left to answer, and forwarding it only makes the default handler log the request and write to a dead socket. A deadline always reaches the error handler, because the client is still there and expects a response.

`cancelErrorHandler()` is opt-in and mounted after the routes. It answers a deadline with the status stamped on the error, answers a shutdown cancellation with its fallback status (`503`, or whatever `status` you pass), leaves a departed client alone, and passes anything that is not a cancellation straight through.

### Options

| Option         | Default | Meaning                                                                                               |
| -------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `timeout`      | none    | Handler deadline. A number is the millisecond shorthand, the object form is `{ ms, status, message }` |
| `signal`       | none    | An external `AbortSignal`, or an array of them, composed alongside the wired one                      |
| `onDisconnect` | none    | Called once when the client goes away. Cleanup and metrics only, the response is unreachable          |
| `onTimeout`    | none    | Called once when the deadline fires. The client is still connected                                    |

Cancelable promise flags (`bubble`, `shield`, `strict`, `asyncCancel`, `forceCancelable`) are accepted too and passed to the handler's promise.

Options given to `cancelMiddleware` are inherited by every handler on the request. A route's own options are merged over them key by key, so a router-wide deadline and a per-route override compose the way you would expect.

## API

### Handlers

- `cancelableHandler(handler, options?)` wraps a handler and returns an express `RequestHandler`
- `cancelMiddleware(options?)` installs the request signal up front and supplies inherited options
- `cancelErrorHandler(options?)` maps a cancellation to a response, mounted after the routes

### Request signal

- `getRequestSignal(req, res)` returns the request's `CancelSignal`, installing it on first use. It is the guarded replacement for node's own `IncomingMessage.prototype.signal`, which aborts once the request stream finishes reading rather than when the client disconnects, so it fires on a healthy in-flight request the moment its body has been consumed.

### Shutdown

- `shutdown(server, options?)` cancels in-flight handlers and resolves with `{ canceled, completed, timedOut }`

### Reasons

- `CLIENT_DISCONNECTED`, `SERVER_SHUTDOWN`, `HANDLER_TIMEOUT`

### Types

- `ICancelableHandlerOptions`, `ICancelErrorHandlerOptions`, `IShutdownOptions`, `IShutdownResult`

## Compatibility

Node.js 18 and later, express 4.18 and later (including express 5), TypeScript 4.2 and later. Requires `@cancjs/promise >=1.0.0` and `@cancjs/coroutine >=1.0.0` as peer dependencies. Everything else follows [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

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
