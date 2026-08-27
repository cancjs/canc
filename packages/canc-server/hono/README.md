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
- Graceful drain that cancels in-flight handlers and reports what happened
- No runtime dependencies beyond hono itself

## Getting Started

### Installation

```sh
npm install @cancjs/server-hono @cancjs/promise @cancjs/coroutine hono @hono/node-server
```

`@cancjs/promise`, `@cancjs/coroutine`, `hono` and `@hono/node-server` are peer dependencies. `@hono/node-server` is only exercised on the node runtime, but the wrapper detects it at request time rather than at import time, so it stays a required peer like the rest of the family. This package is ecosystem tier: a minor release can carry a breaking change, so pin it with a tilde, `~1.4` (pin the minor, not `~1.x`, which npm expands to the same range as `^1`), rather than the default caret. See [Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md) for the full policy.

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

Share the request signal with anything else the request owns:

```js
import { getRequestSignal } from '@cancjs/server-hono';

app.get('/exports/ledger', (c) => {
  const em = orm.em.fork({ signal: getRequestSignal(c) });
  // ...
});
```

Drain in-flight requests on shutdown, passing what `serve()` returned:

```js
import { drain } from '@cancjs/server-hono';

const server = serve({ fetch: app.fetch, port: 3000 });

process.on('SIGTERM', async () => {
  const { canceled, completed, timedOut } = await drain(server, { timeout: 10_000 });

  logger.info({ canceled, completed, timedOut }, 'server drained');
  process.exit(0);
});
```

## How It Works

### Two runtimes, one handler

Every call checks whether `@hono/node-server` published its node request and response on the context. When it did, the wrapper wires cancellation from the response, the same `'close'` plus `!writableEnded` recipe as the rest of the family. When it did not, the request is running on a Web standard runtime, and the wrapper reads `Request.signal` instead, which does mean disconnect there. Presence of the node pair is the whole check; nothing is compared against a runtime name.

A Web runtime has no response object to hang a settle event off, so the wrapper collects its own teardown callbacks and fires them once when the handler's task settles, in place of the response close event the node path uses.

### The wrapper never writes the response

A cancellation whose client is already gone still has to answer with something, because a Hono handler must resolve to a `Response`. It answers `499`, the status nginx logs for a client that closed the request first, and that response never reaches a reader. A deadline is different: the client is still there, so the error is thrown on to `app.onError` instead of being swallowed.

### Status codes need an error handler

Hono does not read a status off a thrown error the way express, fastify and koa do. Without `cancelErrorHandler()` mounted on `app.onError`, a deadline reaches Hono's default handler and answers `500` regardless of the `status` the timeout was given. `cancelErrorHandler()` reads the error itself: a deadline answers with its own status, a shutdown cancellation answers with the fallback status, a departed client gets `499`, and one of Hono's own exceptions (anything with a `getResponse()`) still answers with the response it wanted.

## Description

### Handler kinds

A **generator** handler is driven as a coroutine, so a cancellation unwinds it at its current `yield`. This is the flavor with real mid-flight cancellation.

Any **other** handler runs signal-only. The request signal still fires, `onDisconnect` still runs, and a cancelable promise the handler returns is canceled, but a plain `async` body has no suspension points to unwind and runs to completion. That is a real limit, not an oversight: nothing can interrupt an `await` from outside.

### Options

| Option         | Default | Meaning                                                                                               |
| -------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `timeout`      | none    | Handler deadline. A number is the millisecond shorthand, the object form is `{ ms, status, message }` |
| `signal`       | none    | An external `AbortSignal`, or an array of them, composed alongside the wired one                      |
| `onDisconnect` | none    | Called once when the client goes away. Cleanup and metrics only, the response is unreachable          |
| `onTimeout`    | none    | Called once when the deadline fires. The client is still connected                                    |

Cancelable promise flags (`bubble`, `shield`, `strict`, `asyncCancel`, `forceCancelable`) are accepted too and passed to the handler's promise.

Options given to `cancelMiddleware` are inherited by every handler on the request. A route's own options are merged over them key by key.

### Telling a disconnect from a deadline

Both raise a `CancelError`. The discriminator is `isCancelError(error) && !error.timedOut`; a deadline sets `timedOut` through its `TimeoutError` cause. The exported reason strings, `CLIENT_DISCONNECTED`, `SERVER_SHUTDOWN` and `HANDLER_TIMEOUT`, are for logs and for humans reading them, never for branching.

### Draining

`drain` takes what `serve()` returned, not the Hono app. On node it stops the server accepting connections, closes idle keep-alive sockets, cancels every in-flight handler, then waits for them within a grace window before closing what is left. It resolves with counts rather than throwing, and a second call while the first is running returns the same result. There is no drain path for a Web standard runtime without a node server object; that deployment shape has no server to stop accepting connections on in the first place.

## API

### Handlers

- `cancelableHandler(handler, options?)` wraps a handler and returns a Hono `Handler`
- `cancelMiddleware(options?)` installs the request signal up front and supplies inherited options
- `cancelErrorHandler(options?)` maps a cancellation to a response, mounted with `app.onError`

### Request signal

- `getRequestSignal(c)` returns the request's `CancelSignal`, installing it on first use

### Shutdown

- `drain(server, options?)` cancels in-flight handlers and resolves with `{ canceled, completed, timedOut }`

### Reasons

- `CLIENT_DISCONNECTED`, `SERVER_SHUTDOWN`, `HANDLER_TIMEOUT`

## Compatibility

Node.js 18 and later, Hono 4 and later, `@hono/node-server` 1 and later, TypeScript 4.2 and later. Requires `@cancjs/promise >=1.0.0` and `@cancjs/coroutine >=1.0.0` as peer dependencies. Everything else follows [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

Tested against `@hono/node-server`. Other Web standard runtimes (Cloudflare Workers, Deno, Bun's fetch handler) take the `Request.signal` path and are not independently verified here; their own disconnect-signal reliability is a property of the runtime, not of this package.

## Documentation

- [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for core cancellation semantics and `CancelError`
- [`@cancjs/coroutine`](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine) for the generator flavor used in every sample here
- [Root README](https://github.com/cancjs/canc/blob/master/README.md) for monorepo overview
- [Examples](https://github.com/cancjs/canc/tree/master/examples) for application integration samples

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](./LICENSE)
