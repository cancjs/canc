<div align="center">
  <img src="https://raw.githubusercontent.com/cancjs/canc/master/assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<h1 align="center">@cancjs/server-fastify</h1>

<p align="center">
Cancel Fastify route handlers when the client disconnects or a deadline passes.
</p>

---

## Introduction

A Fastify handler keeps running after the client is gone. The database query finishes, the upstream call completes, the result is serialized, and then it is written to a socket nobody is reading. On a route that fans out to several services, that is wasted work per abandoned request.

This package gives every request one cancel signal, wired from the response side, and a wrapper that runs a route handler under it. A generator handler stops at its next `yield`. Request-scoped work started elsewhere, an ORM context or an outbound fetch, can take the same signal and stop with it, because the signal is installed once per request and shared.

It also carries the two things a server needs around that: a per-handler deadline that answers with a status you choose, and a graceful shutdown that cancels everything in flight before the process exits.

## Features

- One cancel signal per request, wired from the response and shared by every consumer
- Generator handlers stop mid-flight, at the `yield` they are suspended on
- Per-route or per-app deadline, with the HTTP status and message of your choosing
- Never writes to a socket the client has already left
- Graceful shutdown that cancels in-flight handlers and closes the instance
- No decorators on the request or the instance, so no module augmentation is needed
- Route generics flow through, including the reply type

## Getting Started

### Installation

```sh
npm install @cancjs/server-fastify @cancjs/promise @cancjs/coroutine fastify fastify-plugin
```

`@cancjs/promise`, `@cancjs/coroutine`, `fastify` and `fastify-plugin` are peer dependencies. This package is ecosystem tier: a minor release can carry a breaking change, so pin it with a tilde, `~1.4` (pin the minor, not `~1.x`, which npm expands to the same range as `^1`), rather than the default caret. See [Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md) for the full policy.

### Usage

```js
import Fastify from 'fastify';
import * as canc from '@cancjs/coroutine';
import * as cancServer from '@cancjs/server-fastify';

const app = Fastify();

await app.register(cancServer.cancelPlugin, { timeout: 30_000 });
app.setErrorHandler(cancServer.cancelErrorHandler());

app.get('/invoices/:id', cancServer.cancelableHandler(function* (request) {
  const invoice = yield* canc.await(invoices.findById(request.params.id));
  const paid = yield* canc.await(payments.listFor(invoice.id));

  return { invoice, payments: paid };
}));

await app.listen({ port: 3000 });
```

If the client hangs up while the payment lookup is in flight, the handler unwinds at that `yield` and nothing is written back. If the route takes longer than thirty seconds, the client gets a 503 instead of an open connection.

Shutting down:

```js
process.on('SIGTERM', async () => {
  const { canceled, completed, timedOut } = await cancServer.shutdown(app, { timeout: 10_000 });

  console.log(`shut down: ${completed} finished, ${canceled} canceled, gave up: ${timedOut}`);
});
```

## How It Works

### The signal is wired from the response

The listener is `reply.raw.on('close')` guarded by `!reply.raw.writableEnded`, never `request.raw.on('close')`.

`IncomingMessage` emits `'close'` when the request stream has been read, which for a POST behind a body parser is the first millisecond of the handler, with the client still connected. `ServerResponse` emits `'close'` either when the response completed or when the connection died early, and `writableEnded` is what separates those two.

Platform request signals have the same defect and are not adopted. Node's own `IncomingMessage.prototype.signal` is a `'close'` listener with no guard, and Fastify's `request.signal` is `raw.on('close', onAbort)`, which aborts at handler start on any request carrying a body. Fastify's `onRequestAbort` hook does guard, so the framework disagrees with itself here. An external signal is used only when you pass one through the `signal` option.

### Not the platform request signal

Fastify's `request.signal` aborts when the request stream ends, not when the client disconnects. With a body parser on a POST that happens before the handler runs, so work started from that signal is canceled immediately. This package listens on the response instead, and only treats a close as a disconnect while the response has not finished writing.

### One listener, one cancellation

The cancel state is cached on the raw request under a registered symbol, so the plugin, the route wrapper, and anything else asking for `getRequestSignal` all reach the same object. A request has exactly one close listener no matter how many consumers want the signal, and one disconnect produces one cancellation.

### What the wrapper does and does not answer

The wrapper never writes the response. A cancellation that arrives with the client already gone is dropped and the reply is hijacked, because there is nothing to answer on. Everything else is rethrown and reaches your error handler, including a missed deadline, which carries `status` and `statusCode` so Fastify's own error handling reports the code you configured.

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

Options given to the plugin are defaults for the whole app. Options given to `cancelableHandler` win on every key they set, so one route can raise or drop the deadline the app registered.

The deadline default status is 503. Set `timeout: { ms: 30_000, status: 504 }` for a gateway-style code.

### Telling a disconnect from a deadline

Both raise a `CancelError`. The discriminator is `isCancelError(error) && !error.timedOut`; a deadline sets `timedOut` through its `TimeoutError` cause. The exported reason strings are for logs and for humans reading them, never for branching.

### Shutting down

`shutdown` takes the Fastify instance, not `app.server`. It closes the server to new connections, closes idle ones, cancels every in-flight handler with the shutdown reason, waits for them within the grace window, and only then awaits `app.close()`, so `onClose` hooks and plugin teardown run against a server that has already finished canceling its handlers. It cancels the request signal too, so work started from `getRequestSignal` and never awaited by the handler stops with the shutdown instead of outliving it. A second call while the first is still running joins it rather than starting over.

## API

### Handlers

| Export              | Signature                                   |
| ------------------- | ------------------------------------------- |
| `cancelableHandler` | `(handler, options?) => RouteHandlerMethod` |
| `getRequestSignal`  | `(request, reply) => CancelSignal`          |

`getRequestSignal` is public on purpose, and it is not `request.signal`. Fastify wires that one as `raw.on('close', onAbort)` with no guard, so on a POST with a body it aborts a millisecond into the handler while the socket is still open; `getRequestSignal` is the guarded replacement, wired from the response instead. Request-scoped work outside the route, an ORM context or an outbound call, should take its signal from here rather than wiring a second listener.

### Registration

| Export               | Signature                                       |
| -------------------- | ----------------------------------------------- |
| `cancelPlugin`       | `FastifyPluginAsync<ICancelableHandlerOptions>` |
| `cancelErrorHandler` | `(options?) => TCancelErrorHandler`             |
| `shutdown`           | `(app, options?) => Promise<IShutdownResult>`   |

### Reasons

`CLIENT_DISCONNECTED`, `SERVER_SHUTDOWN` and `HANDLER_TIMEOUT` are the reason strings the three triggers carry.

### Types

`ICancelableHandlerOptions`, `ICancelErrorHandlerOptions`, `IShutdownOptions`, `IShutdownResult`, `TCancelErrorHandler`, `TFastifyRouteHandler`, `TTimeoutOption`.

## Compatibility

Node.js 18 and later, Fastify 5 and later, TypeScript 4.2 and later. Requires `@cancjs/promise >=1.1.0` and `@cancjs/coroutine >=1.0.0` as peer dependencies. Everything else follows [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

Client disconnect detection is only as good as the network below it. A connection dropped without a FIN produces no event until TCP times out, and a buffering reverse proxy may never pass a client abort to the origin.

## Documentation

- [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for core cancellation semantics and `CancelError`
- [`@cancjs/coroutine`](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine) for the generator dialect used by handlers
- [Server integration recipes](https://github.com/cancjs/canc/blob/master/docs/server-recipes.md) for frameworks with no package of their own
- [Root README](https://github.com/cancjs/canc/blob/master/README.md) for monorepo overview
- [Examples](https://github.com/cancjs/canc/tree/master/examples) for application integration samples

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](./LICENSE)
