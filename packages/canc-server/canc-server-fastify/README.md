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

It also carries the two things a server needs around that: a per-handler deadline that answers with a status you choose, and a graceful shutdown that gives in-flight handlers a grace window to finish, then cancels the rest before the process exits.

## Features

- One cancel signal per request, wired from the response and shared by every consumer
- Generator handlers stop mid-flight, at the `yield` they are suspended on
- Per-route or per-app deadline, with the HTTP status of your choosing
- Never writes to a socket the client has already left
- Request hooks that stop with the request, typed as Fastify's own hooks
- Generator route handlers and route hooks run as they are once the plugin is registered
- Plugin startup that stops on its deadline or on shutdown, so no connection is left half open
- Graceful shutdown that lets in-flight handlers finish within a grace window, then cancels the rest and closes the instance
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

app.get('/invoices/:id', cancServer.cancelableHandler(function* (request) {
  const invoice = yield* canc.await(invoices.findById(request.params.id));
  const paid = yield* canc.await(payments.listFor(invoice.id));

  return { invoice, payments: paid };
}));

await app.listen({ port: 3000 });
```

If the client hangs up while the payment lookup is in flight, the handler stops at that `yield` and nothing is written back. If the route takes longer than thirty seconds, the client gets a 503 instead of an open connection.

Shutting down needs nothing more than fastify's own `app.close()`: the plugin drains the server inside it, so in-flight requests finish and the ones still running at `cancelAfter` are canceled. To pick the windows, or to read what happened, create the shutdown before `app.listen()`:

```js
const shutdown = cancServer.createShutdown(app, { cancelAfter: 10_000 });

process.on('SIGTERM', async () => {
  const { canceled, completed, timedOut } = await shutdown();

  console.log(`shut down: ${completed} finished, ${canceled} canceled, gave up: ${timedOut}`);
});
```

## How It Works

### The signal is wired from the response

The listener is `reply.raw.on('close')` guarded by `!reply.raw.writableEnded`, never `request.raw.on('close')`.

`IncomingMessage` emits `'close'` when the request stream has been read, which for a POST behind a body parser is the first millisecond of the handler, with the client still connected. `ServerResponse` emits `'close'` either when the response completed or when the connection died early, and `writableEnded` is what separates those two.

Platform request signals have the same defect and are not adopted. Node's own `IncomingMessage.prototype.signal` is a `'close'` listener with no guard, and Fastify's `request.signal` is `raw.on('close', onAbort)`, which aborts at handler start on any request carrying a body. Fastify's `onRequestAbort` hook does guard, but it misses a client that disconnects after a POST body has been read, and `request.signal` also aborts at the end of every normal GET response. An external signal is used only when you pass one through the `signal` option.

### Not the platform request signal

Fastify's `request.signal` aborts when the request stream ends, not when the client disconnects. With a body parser on a POST that happens before the handler runs, so work started from that signal is canceled immediately. This package listens on the response instead, and only treats a close as a disconnect while the response has not finished writing.

### Bounded listeners, one cancellation

The cancel state is cached on the raw request under a registered symbol, so the plugin, the route wrapper, and anything else asking for `getRequestSignal` all reach the same object. However many consumers want the signal, the request's close listeners stay bounded: wrapped layers share the cancel state instead of adding listeners of their own. One disconnect produces one cancellation.

### What the wrapper does and does not answer

The wrapper never writes the response. A cancellation that arrives with the client already gone is dropped and the reply is hijacked, because there is nothing to answer on. Everything else is rethrown and reaches Fastify's error handling, including a missed deadline, which carries `status` and `statusCode` so Fastify answers with the code you configured.

The five server adapters use `Request canceled` as `CancelError.message` for request cancellations minted by their shared deadline and shutdown handlers. The original diagnostic is on the direct `cause`, a `TimeoutError` with the deadline message or an `Error` with the shutdown reason. In logs and callbacks, read `error.cause?.message ?? error.message`.

With or without `cancelPlugin`, Fastify's default error handler serializes the cancellation with the HTTP status text in `error` and the fixed message in `message`. A custom handler that delegates with `reply.send(error)` gets the same body. For a 503 response, Fastify sends:

```json
{
  "statusCode": 503,
  "error": "Service Unavailable",
  "message": "Request canceled"
}
```

A custom handler that sends its own JSON controls the body and can explicitly include the original diagnostic from `error.cause`.

When the response head already went out, no status can be sent, so the socket is destroyed instead of left looking complete. The cut is logged once at error level through `request.log`, since the client sees only a reset. A cancellation the request does not own, such as one the handler raised itself, is not cut: it goes to the error handler as it is. A handler that fails after its cancellation has already answered the request is logged the same way, at error level, through `request.log`.

### Composing an error handler

Fastify answers a request's own cancellation with its status by itself, so a wrapped route needs no `setErrorHandler`. A deadline answers `503` (or the `status` in `timeout`), and a shutdown answers with its own `status`, with a handler's `status` option applying where the shutdown set none.

Add one only for your own error mapping. `cancelErrorHandler({ onError })` takes every error that is not a cancellation, and the request's own cancellations still get their status:

```js
app.setErrorHandler(cancServer.cancelErrorHandler({
  onError(error, request, reply) {
    if (error instanceof RateLimitError) {
      reply.code(429).send({ message: 'slow down' });

      return;
    }

    reply.send(error);
  },
}));
```

A cancellation the request does not own, such as your own `CancelError` or a timeout you raised yourself, goes to Fastify's handling as it is, not to `onError`. A handler you mount with `setErrorHandler` yourself reads the same `statusCode` on a cancellation, `503` for a deadline and a shutdown alike, so it does not need `cancelErrorHandler` for that.

`cancelErrorHandler({ status })` sets the status a shutdown cancellation gets on a live connection, `503` by default. The shutdown's own `status` wins over it, and it wins over the handler's `status` option. A `status` outside 200 to 599 throws a `RangeError` when `cancelErrorHandler()` is called, not on the first request.

### Request hooks

`cancelableHook(hook, options?)` wraps an `onRequest`, `preValidation` or `preHandler` hook, and `cancelablePreParsing(hook, options?)` a `preParsing` hook: the stages before the route handler.
Both are typed as Fastify's own async hooks, and one `cancelableHook` value mounts on any of its three stages:

```js
app.addHook('preHandler', cancServer.cancelableHook(function* (request) {
  request.user = yield* canc.await(users.findBySession(request.headers.cookie));
}));
```

Wrapped stages share the request's cancel state. A disconnect, a deadline or a shutdown stops a wrapped hook at its current `yield` and runs its `finally` blocks, and the route handler never starts. A wrapped hook settling hands the request on with the deadline still running. A `preParsing` hook gets the payload stream as its third argument, and a stream it returns replaces the payload, as Fastify does for any async `preParsing` hook. An `onRequestAbort` hook is refused with a `TypeError`: its request is already aborted when it runs, so there is nothing left to cancel. A hook called with a payload or an error, such as `onSend` or `onError`, is refused the same way.

A plain hook cannot be stopped from outside. It can take the signal from `getRequestSignal(request, reply)` and pass it to the work it starts. A deadline is checked only where a wrapped stage runs: a plain hook still running when it fires keeps running, and the `503` goes out when the next wrapped stage starts, or never if that hook never settles. Once any stage answers or hijacks the reply, Fastify skips the stages after it.

A plain hook that passed the signal on sees a disconnect as a `CancelError` from the call it made. Fastify then logs that at error level and tries to answer a connection that is gone. Wrapped stages drop that answer themselves; for plain hooks, `cancelErrorHandler()` drops it too, or check for it in your own error handler:

```js
import { isCancelError } from '@cancjs/promise';

app.setErrorHandler((error, request, reply) => {
  if (isCancelError(error) && !reply.raw.writable) {
    reply.hijack();

    return;
  }

  reply.send(error);
});
```

Fastify's own `handlerTimeout` answers `503` without canceling this work, which runs on and makes Fastify warn that the reply was already sent. Use the `timeout` option for work that should stop.

### Generator routes

With `cancelPlugin` registered, a generator function given as a route handler, or as a route-level `onRequest`, `preParsing`, `preValidation` or `preHandler` hook, is wrapped as the route is registered, so `app.get('/x', function* () { ... })` works without `cancelableHandler`. Fastify cannot run a generator function itself: a bare one answers with an empty body, and a bare generator hook never lets the request go on. Plain and async functions are left as they are.

Only routes registered after the plugin are seen, and hooks added with `app.addHook` still need `cancelableHook` or `cancelablePreParsing`. The check looks for a native generator function, so a build that compiles generators down to ES5 hides them from it. TypeScript rejects a bare generator on a route that declares a `Reply` type; wrap that one with `cancelableHandler`. Pass `autoWrap: false` to `cancelPlugin` to turn this off.

### Plugin startup

Fastify's `pluginTimeout` only stops waiting for a plugin: the plugin keeps running after startup failed, and opens its connection anyway. `cancelablePlugin(plugin, options?)` runs the plugin under a cancel scope instead:

```js
app.register(cancServer.cancelablePlugin(function* (instance) {
  const db = yield* canc.await(connectDb(process.env.DATABASE_URL));

  instance.decorate('db', db);
  instance.addHook('onClose', () => db.close());
}));
```

A generator plugin stops at its next `yield` and runs its `finally` blocks when it runs longer than its `timeout`, when a `signal` you pass aborts, or when the `shutdown()` from `createShutdown` starts during startup. The default `timeout` ends just under the instance's `pluginTimeout`, so the cancel lands while Fastify is still waiting; with `pluginTimeout: 0` there is none. A nested plugin gets less time from Fastify than its parent, so give it its own `timeout`. A plain function runs signal-only: a cancelable promise it returns is canceled, an `async` body runs on. Wrap the result with `fastify-plugin` as usual to share decorators. A plain `app.close()` during startup still waits for startup to finish, because Fastify waits for it before closing; call `shutdown()` or pass a signal to stop it.

A startup that runs past its `timeout` fails with a `CancelError` whose `timedOut` is `true` and whose `code` is `FST_ERR_PLUGIN_TIMEOUT`, the code Fastify gives its own plugin timeout, so existing `err.code` checks keep working. An `instanceof` check against Fastify's error classes does not match it; test `isCancelError(err)` or `err.code`.

## Description

### Handler kinds

A generator handler is driven as a coroutine and is canceled at its next suspension point. Anything else runs signal-only: the request signal still fires, and a cancelable promise the handler returns is canceled, but a plain `async` body has nothing to stop at, so it runs to completion. Use a generator when mid-flight cancellation is the point.

### Options

| Option         | Default | Meaning                                                                                                   |
| -------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `timeout`      | none    | Request deadline, one per request. A number is milliseconds; the object form is `{ ms, status, message }` |
| `signal`       | none    | An `AbortSignal`, or an array of them, composed into the request signal                                   |
| `onDisconnect` | none    | Called once per request when the client goes away. Cleanup and metrics only                               |
| `onTimeout`    | none    | Called once per request when the deadline fires, with the client still connected                          |

`cancelPlugin` also takes `autoWrap`, on by default: see Generator routes.

The flag options of `@cancjs/promise` (`asyncCancel`, `bubble`, `forceCancelable`, `shield`, `strict`) are accepted too and passed to the task.

Options given to the plugin are defaults for the whole app. Options given to `cancelableHandler` win on every key they set, so one route can raise or drop the deadline the app registered.

There is one deadline per request. The plugin starts it at `onRequest`, so it applies to plain routes too. On one, the deadline aborts the request signal and runs `onTimeout`, and the route itself still answers. A route passing its own `timeout` restarts the clock with that value. A wrapped `preHandler` hook settling does not end it. The deadline covers the handler, not the body. It ends once the wrapped handler answering the request settles, so a stream still being written after the handler returned is not cut short by it. A handler that answers from a callback after it returned is no longer covered either. A slow response body is for `server.requestTimeout` or the proxy in front of the server. On a plain route it runs until the response finishes, so `onTimeout` can run while the body is still being written. The lifecycle callbacks run once per request, however many wrapped hooks it passes. A `timeout` of `0` fires at once, and `Infinity`, `NaN`, a negative number or leaving it out sets no deadline. A negative value is not an immediate deadline, and on a route that sets its own `timeout` it lifts the deadline set above it, like `Infinity`. A duration past about 24.8 days is held at that limit.

The deadline default status is 503. Set `timeout: { ms: 30_000, status: 504 }` for a gateway-style code.

### Telling a disconnect from a deadline

Both raise a `CancelError`. The discriminator is `isCancelError(error) && !error.timedOut`; a deadline sets `timedOut` through its `TimeoutError` cause. The exported reason strings are for logs and for humans reading them, never for branching.

### Shutting down

`createShutdown` takes the Fastify instance, not `app.server`, and returns the function that runs the shutdown. It replaces the prerelease `shutdown(app, o)`: call `createShutdown(app)(o)`.

The shutdown runs inside fastify's own close, as a `preClose` hook that `cancelPlugin` registers, so `app.close()`, a close-with-grace helper or a framework built on fastify shuts down gracefully without calling anything from this package. The hook uses the options given to `createShutdown(app, options)`, or the defaults; calling `createShutdown` again with new options replaces the ones a later plain `app.close()` uses. The returned `shutdown(options)` lays its own options over those and runs `app.close()`, resolving with its counts. A startup that `cancelablePlugin` runs and that is still in progress is canceled first. Called before `app.listen()` without the plugin, `createShutdown` registers the same hook. Hooks run in registration order, and the shutdown holds its hook until it ends, so register `cancelPlugin` after plugins whose `preClose` hooks end long-lived connections, such as a websocket server. A `preClose` hook inside an encapsulated plugin runs after the root ones, so after the shutdown.

A request that arrives on a kept-alive connection during the close is fastify's to answer: it sends `503` while `return503OnClosing` is on, its default. Set `return503OnClosing: false` to serve such requests instead.

Fastify gives every `preClose` hook `pluginTimeout` to finish, 10 s by default, and rejects `app.close()` with `AVV_ERR_READY_TIMEOUT` when one runs longer. The default windows would pass it (`cancelAfter` 10 s, `closeAfter` 11 s), so inside fastify's close the shutdown lowers its windows to end just under `pluginTimeout` and logs that once through `app.log.warn`. This applies to an `Infinity` window as well: with the default `pluginTimeout` a `cancelAfter` or `closeAfter` of `Infinity` is lowered like any other, so the request is canceled shortly before the limit. Raise `pluginTimeout` to keep longer windows, or set it to `0` to turn the limit off and keep an `Infinity` window unbounded.

Fastify takes no hook once the instance has started. Created after `app.listen()` without the plugin, `createShutdown` drains the server first, then calls `app.close()`, so a late request on a kept-alive connection is served rather than refused. The options given to `createShutdown(app, options)` apply on that path as well.

The shutdown closes the server to new connections, closes a connection that has received no bytes once it is five seconds old (or at the grace, if shorter), leaves one that has already sent part of a request to finish, and closes idle ones. In-flight requests, wrapped or not, keep running for the grace window. Every response sent from then on carries `Connection: close`, and each connection closes as soon as the response on it finishes. A `keep-alive` the app sets on the reply is overridden as well, except when it is set through fastify's reply headers, which this shutdown cannot reach. On an HTTPS server the same applies to a connection whose client has not finished the TLS handshake.

When the window ends, handlers still running are canceled with the shutdown reason, so their cleanup runs and one that has not started its response can still answer `503`. A request still open then runs until it finishes or `closeAfter`, and connections still busy at `closeAfter` are closed. Shutdown resolves as soon as nothing is open. On Kubernetes, keep `closeAfter` at or below `terminationGracePeriodSeconds` minus the preStop sleep, less a margin for the process to exit, or the kubelet kills the process before the window ends. A `cancelAfter` greater than `closeAfter` throws a `RangeError` synchronously; negative values clamp to 0 before that check. The cancel reaches the request signal too, so work started from `getRequestSignal` and never awaited by the handler stops with the shutdown instead of outliving it.

`status` and `headers` set the answer each request the shutdown cancels gets, for example `shutdown({ cancelAfter: 10_000, status: 504, headers: { 'Retry-After': '5' } })`. For these cancellations `status` takes precedence over a handler's `status` option, and `headers` are added to the answer. A deadline keeps the status it was given. Invalid values throw from `shutdown()`, and from `createShutdown(app, options)` for the options given there: a `status` outside 200 to 599 raises a `RangeError`, and a header name or value HTTP does not allow raises a `TypeError`.

`canceled` counts requests this shutdown canceled, `completed` requests that finished normally, and `timedOut` is set when `closeAfter` ends the window with a request or connection still open.

To add a header to a shutdown answer, set `err.headers` in your own error middleware; fastify applies it. A shutdown cancel and a disconnect both reach a handler as a cancellation, so test `err.status` to tell them apart, since `!err.timedOut` alone matches both. Retry only idempotent requests, because the handler may have partly run. An abort that a library wraps in its own error answers the framework's 500, for a deadline or a shutdown alike.

Pass `cancelAfter: 0` to cancel handlers as soon as the shutdown starts instead, which suits long-lived responses such as server-sent events or long polling that would otherwise hold the whole window.

Created after `app.listen()` without the plugin, it finishes correctly but slower, because a connection opened before the call is unknown to it. If that connection has not sent a request yet, or its request is still in flight and neither `cancelPlugin` nor a wrapped handler recorded it, the connection is closed only when `closeAfter` ends. That response goes out without `Connection: close`.

A second call while the first is still running joins it rather than starting over, and calling `createShutdown` again with the same instance returns the same function.

Migrating from `timeout`: rename it to `cancelAfter`. `cancelOnStart: true` becomes `cancelAfter: 0`, and without `closeAfter` the window is then 1 s instead of 10 s, so pass `closeAfter` to keep a longer one. The value is set once per server, so an app that mixes long-lived streams with ordinary routes ends its own streams when the shutdown starts and keeps the default for the rest.

A `cancelAfter` of `Infinity` waits for the responses however long they take only where nothing lowers it: after `app.listen()` without the plugin, inside fastify's close with `pluginTimeout: 0`, or with `closeServer: false`. A finite one past about 24.8 days is held at that limit.

Pass `closeServer: false` to drain the server without closing the instance, in which case `app.close()` is not called. Otherwise `onClose` hooks and plugin teardown run once the shutdown has ended, against a server that has already finished with its handlers. A failing `onClose` hook is logged, and the counts are still returned. With `closeServer: false` the windows are the caller's and are not lowered, and a plain `app.close()` that starts while such a shutdown is still running is not protected either: when the shutdown outlives `pluginTimeout`, that close rejects with `AVV_ERR_READY_TIMEOUT`, though the request is still answered `503`.

## API

### Handlers

| Export                 | Signature                                   |
| ---------------------- | ------------------------------------------- |
| `cancelableHandler`    | `(handler, options?) => RouteHandlerMethod` |
| `cancelableHook`       | `(hook, options?) => async hook`            |
| `cancelablePreParsing` | `(hook, options?) => async preParsing hook` |
| `getRequestSignal`     | `(request, reply) => CancelSignal`          |

`getRequestSignal` is public on purpose, and it is not `request.signal`. Fastify wires that one as `raw.on('close', onAbort)` with no guard, so on a POST with a body it aborts a millisecond into the handler while the socket is still open; `getRequestSignal` is the guarded replacement, wired from the response instead. Request-scoped work outside the route, an ORM context or an outbound call, should take its signal from here rather than wiring a second listener.

### Registration

| Export               | Signature                                                   |
| -------------------- | ----------------------------------------------------------- |
| `cancelPlugin`       | `FastifyPluginAsync<ICancelPluginOptions>`                  |
| `cancelablePlugin`   | `(plugin, options?) => FastifyPluginAsync`                  |
| `cancelErrorHandler` | `(options?) => TCancelErrorHandler`                         |
| `createShutdown`     | `(app, options?) => (options?) => Promise<IShutdownResult>` |

### Reasons

`CLIENT_DISCONNECTED`, `SERVER_SHUTDOWN` and `HANDLER_TIMEOUT` are the reason strings the three triggers carry.

### Types

`ICancelableHandlerOptions`, `ICancelablePluginOptions`, `ICancelErrorHandlerOptions`, `ICancelPluginOptions`, `IShutdownOptions`, `IShutdownResult`, `TCancelableHookFn`, `TCancelablePluginFn`, `TCancelablePreParsingFn`, `TCancelErrorHandler`, `TFastifyPreParsingHook`, `TFastifyRequestHook`, `TFastifyRouteHandler`, `TTimeoutOption`.

### Readiness and websockets

Node does not list a websocket as a connection once it is upgraded, so `shutdown()` cannot close it with a close frame. An upgraded socket still open when the shutdown finishes is destroyed without a close frame, which the client sees as code `1006` (abnormal closure), as it does for any socket still open at `closeAfter`. Close your websockets yourself when shutdown starts, with code `1001` (going away), from a `preClose` hook registered before `cancelPlugin`, or alongside the shutdown:

```ts
await Promise.all([closeWebSockets(1001), shutdown({ cancelAfter: 5_000 })]);
```

An upgraded socket still open at `cancelAfter` is destroyed there. To keep new traffic away first, fail your readiness check and wait a few seconds before calling `shutdown()`. In Kubernetes a `preStop` sleep does the same job.

## Compatibility

The Fastify 5 adapter requires **Node.js 22 or later**. Requires `@cancjs/promise >=1.1.0-0` and `@cancjs/coroutine >=1.0.0` as peers. The combinations below were checked with isolated installed package copies, not a shared workspace.

| Framework peers                      | Node host and optional peers        | TypeScript | @types/node | Resolver / skipLibCheck    | Status                                          |
| ------------------------------------ | ----------------------------------- | ---------- | ----------- | -------------------------- | ----------------------------------------------- |
| Fastify 5.0.0, fastify-plugin 5.0.0  | Node.js 22.12+ for tested injection | 5.9.3      | 20.19.43    | NodeNext CJS + ESM / false | Supported, strict                               |
| Fastify 5.12.8, fastify-plugin 6.0.1 | Node.js 22.12+ for tested injection | 5.4.5      | 22.20.5     | NodeNext CJS + ESM / false | Supported, strict                               |
| Fastify 5.12.8, fastify-plugin 6.0.1 | Node.js 22.12+                      | 5.9.3      | 20.19.43    | NodeNext CJS + ESM / false | Supported, strict                               |
| Fastify 5.0.0, fastify-plugin 5.0.0  | Node.js 22+                         | 5.0.4      | 18.19.0     | Node CJS / true            | Advisory, strict library checking fails         |
| Fastify 5.0.0, fastify-plugin 5.0.0  | Node.js 22+                         | 4.2.4      | 18.19.0     | Node CJS / either          | Unsupported, framework declaration syntax fails |

Node.js 20 is unsupported: the adapter declares Node.js 22+ and strict npm installation can reject the peer graph. Relaxed Node.js 20 installation is diagnostic only. HTTP sockets were verified on Node.js 22.0, including a normal scripts-enabled strict `npm ci`. On early Node.js 22 patches, `inject()` depends on the resolved `cookie` and `light-my-request` graph; Node.js 22.12 is the verified injection host.

Client disconnect detection depends on the network. A connection dropped without a FIN may produce no event until TCP times out. A buffering reverse proxy may not forward an abort.

HTTP/1.1 and HTTPS only. HTTP/2 is not supported yet.

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
