<div align="center">
  <img src="https://raw.githubusercontent.com/cancjs/canc/master/assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<h1 align="center">@cancjs/server-koa</h1>

<p align="center">
Cancel Koa middleware and route handlers when the client disconnects or a deadline passes.
</p>

---

## Introduction

A Koa handler keeps running after the client is gone. The query finishes, the upstream call completes, the body is serialized, and then Koa writes it to a socket nobody is reading. On a route that fans out to several services, every abandoned request costs the full amount of work.

This package gives each request one cancel signal, wired from the response side, and a wrapper that runs a handler under it. A generator handler stops at its next `yield`. Request-scoped work started elsewhere, a database context or an outbound fetch, can take the same signal and stop with it, because the signal is installed once per request and shared by every consumer.

It also carries the two things a server needs around that: a per-handler deadline that answers with a status you choose, and a graceful shutdown that cancels everything in flight before the process exits.

## Features

- One cancel signal per request, wired from the response and shared by every consumer
- Generator handlers stop mid-flight, at the `yield` they are suspended on
- Per-route or per-app deadline, with the HTTP status and message of your choosing
- Never writes to a socket the client has already left
- Graceful shutdown that cancels in-flight handlers and closes the server
- No properties added to `ctx`, so no module augmentation is needed
- Koa's context generics flow through, including a bare `function* (ctx)` with no annotations
- Works with Koa 2 and Koa 3, and with any router that takes a plain middleware

## Getting Started

### Installation

```sh
npm install @cancjs/server-koa @cancjs/promise @cancjs/coroutine koa
```

`@cancjs/promise`, `@cancjs/coroutine` and `koa` are peer dependencies. This package is ecosystem tier: a minor release can carry a breaking change, so pin it with a tilde, `~1.4` (pin the minor, not `~1.x`, which npm expands to the same range as `^1`), rather than the default caret. See [Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md) for the full policy.

### Usage

```js
import Koa from 'koa';
import Router from '@koa/router';
import * as canc from '@cancjs/coroutine';
import * as cancServer from '@cancjs/server-koa';

const app = new Koa();
const router = new Router();

app.use(cancServer.cancelMiddleware({ timeout: 30_000 }));

router.get('/invoices/:id', cancServer.cancelableHandler(function* (ctx) {
  const invoice = yield* canc.await(invoices.findById(ctx.params.id));
  const paid = yield* canc.await(payments.listFor(invoice.id));

  ctx.body = { invoice, payments: paid };
}));

app.use(router.routes());

const server = app.listen(3000);
```

If the client hangs up while the payment lookup is in flight, the handler unwinds at that `yield` and nothing is written back. If the route takes longer than thirty seconds, the client gets a 503 instead of an open connection.

Shutting down:

```js
process.on('SIGTERM', async () => {
  const { canceled, completed, timedOut } = await cancServer.shutdown(server, { timeout: 10_000 });

  console.log(`shut down: ${completed} finished, ${canceled} canceled, gave up: ${timedOut}`);
});
```

## How It Works

### The signal is wired from the response

The listener is `ctx.res.on('close')` guarded by `!writableEnded`, never `ctx.req.on('close')`.

`IncomingMessage` emits `'close'` when the request stream has been read, which for a POST behind a body parser is the first millisecond of the handler, with the client still connected. `ServerResponse` emits `'close'` either when the response completed or when the connection died early, and `writableEnded` is what separates those two. An external signal is used only when you pass one through the `signal` option.

### One listener, one cancellation

The cancel state is cached on the raw request under a registered symbol, so the middleware, the route wrapper, and anything else asking for `getRequestSignal` all reach the same object. A request has exactly one close listener no matter how many consumers want the signal, and one disconnect produces one cancellation.

`getRequestSignal` is the guarded replacement for node's own `IncomingMessage.prototype.signal`, which `ctx.req` inherits and which aborts once the request stream finishes reading rather than when the client disconnects, so a body-carrying request would abort on arrival if that signal were adopted as-is.

### Middleware is the error handler

Koa has no dedicated error-middleware slot. An `await next()` wrapped in a `try`/`catch` is what an error handler looks like here, so `cancelMiddleware` does both jobs and this package exposes no separate `cancelErrorHandler` the way the express and fastify packages do. Mount it first, before the router and before anything that can throw a cancellation at you.

### Nothing is written to a dead socket

A cancellation that arrives with the client already gone is dropped in place: `ctx.respond` is set to `false`, which tells Koa to skip its own response handling entirely. The check reads `writableEnded` and `destroyed` on the raw response rather than `ctx.writable`, because `ctx.writable` reads the socket and reports a departed client as still writable. Everything else is rethrown and travels up the middleware stack as usual.

## Description

### Handler kinds

A generator handler is driven as a coroutine and is canceled at its next suspension point. Anything else runs signal-only: the request signal still fires, and a cancelable promise the handler returns is canceled, but a plain `async` body has no suspension point to unwind and runs to completion. Use a generator when mid-flight cancellation is the point.

### Options

| Option         | Default | Meaning                                                                                  |
| -------------- | ------- | ---------------------------------------------------------------------------------------- |
| `timeout`      | none    | Handler deadline. A number is milliseconds; the object form is `{ ms, status, message }` |
| `signal`       | none    | An `AbortSignal`, or an array of them, composed into the request signal                  |
| `onDisconnect` | none    | Called once when the client goes away. Cleanup and metrics only                          |
| `onTimeout`    | none    | Called once when the deadline fires, with the client still connected                     |

The flag options of `@cancjs/promise` (`asyncCancel`, `bubble`, `forceCancelable`, `shield`, `strict`) are accepted too and passed to the task.

Options given to `cancelMiddleware` are defaults for everything mounted below it. Options given to `cancelableHandler` win on every key they set, so one route can raise or drop the deadline the app registered.

The deadline default status is 503. Set `timeout: { ms: 30_000, status: 504 }` for a gateway-style code.

### Telling a disconnect from a deadline

Both raise a `CancelError`. The discriminator is `isCancelError(error) && !error.timedOut`; a deadline sets `timedOut` through its `TimeoutError` cause. The exported reason strings are for logs and for humans reading them, never for branching.

### Shutting down

`shutdown` takes the `http.Server` that `app.listen()` returns, not the Koa application, because a Koa application has no `close` of its own to sequence against. It stops accepting new connections, closes idle ones, cancels every in-flight handler with the shutdown reason, and waits for them within the grace window. It cancels the request signal too, so work started from `getRequestSignal` and never awaited by the handler stops with the shutdown instead of outliving it. It resolves with what happened rather than throwing, and a second call while the first is still running joins it rather than starting over, so a pair of signal handlers is safe to wire without a guard.

## API

### Handlers

| Export              | Signature                                       |
| ------------------- | ----------------------------------------------- |
| `cancelableHandler` | `(handler, options?) => (ctx) => Promise<void>` |
| `getRequestSignal`  | `(ctx) => CancelSignal`                         |

`getRequestSignal` is public on purpose, and it is not `ctx.req.signal` or anything derived from it: node's `IncomingMessage.prototype.signal` aborts once the request stream finishes reading rather than when the client disconnects, so a body-carrying request would abort on arrival if that signal were adopted as-is. Request-scoped work outside the route, a database context or an outbound call, should take its signal from here rather than wiring a second listener.

### Registration

| Export             | Signature                                        |
| ------------------ | ------------------------------------------------ |
| `cancelMiddleware` | `(options?) => Middleware`                       |
| `shutdown`         | `(server, options?) => Promise<IShutdownResult>` |

`cancelMiddleware` is optional if every route is wrapped, since a wrapped route installs the signal on its own. Mount it when one deadline or one `onDisconnect` hook should cover a whole router, or when a cancellation raised by request-scoped work outside a wrapped handler still needs an answer.

### Reasons

`CLIENT_DISCONNECTED`, `SERVER_SHUTDOWN` and `HANDLER_TIMEOUT` are the reason strings the three triggers carry.

### Types

`ICancelableHandlerOptions`, `IShutdownOptions`, `IShutdownResult`.

## Compatibility

Node.js 18 and later, Koa 2.13 and later (including Koa 3), TypeScript 4.2 and later. Requires `@cancjs/promise >=1.0.0` and `@cancjs/coroutine >=1.0.0` as peer dependencies. Everything else follows [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

Client disconnect detection is only as good as the network below it. A connection dropped without a FIN produces no event until TCP times out, and a buffering reverse proxy may never pass a client abort to the origin.

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
