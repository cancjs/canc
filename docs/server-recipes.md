# Server Integration Recipes

The canc server family ships packages for Node's own `http`, express, fastify, koa and hono. Plenty of other frameworks run on the same two request shapes underneath, so they need a recipe rather than a package. This document collects those recipes, and it is equally explicit about the places where client-disconnect cancellation cannot be made to work at all.

Nothing here is a published package. Each recipe is code you paste into your own project and own.

## The two shapes

Almost every recipe below reduces to one of two cases.

**Node shape.** The framework hands you, somewhere, the raw `IncomingMessage` and `ServerResponse`. If you can reach those two objects, use [`@cancjs/server-node`](https://github.com/cancjs/canc/tree/master/packages/canc-server/canc-server-node) directly. Its `getRequestSignal(req, res)` installs one close listener per request, guarded by `writableEnded`, and caches the signal so every later caller shares it. You do not need to reimplement any of that. Its `drain` cancels the request signal too, so work started from `getRequestSignal` and never awaited by the handler stops with the shutdown instead of outliving it.

```js
import * as cancServer from '@cancjs/server-node';
import * as canc from '@cancjs/coroutine';

const signal = cancServer.getRequestSignal(req, res);

const task = canc.async(function* () {
  const invoice = yield* canc.await(invoices.findById(id));

  return invoice;
}, undefined, { signal });
```

**Web shape.** The framework hands you a Web `Request`. Unlike its Node namesake, `Request.signal` genuinely means the client went away, so it can be adopted as-is. Pass it straight to the coroutine.

```js
import * as canc from '@cancjs/coroutine';

const task = canc.async(function* () {
  const invoice = yield* canc.await(invoices.findById(id));

  return invoice;
}, undefined, { signal: request.signal });
```

Whether that signal actually fires on disconnect is a property of the runtime, not of canc. Verify it in yours before relying on it; the section on unachievable cases lists the runtimes where it is known not to.

In both shapes the handler must be a generator for mid-flight cancellation to mean anything. A plain `async` body has no suspension point to unwind, so it runs to completion no matter what the signal does. That limitation is the same in every recipe below and is not repeated each time.

## Frameworks on the Node shape

### NestJS

Only an interceptor is offered here, not a full recipe. Nest sits on top of either express or fastify, and both of those already have a package, so the useful piece is the bridge that carries the request signal into Nest's own execution model.

```ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import * as cancServer from '@cancjs/server-node';
import { Observable } from 'rxjs';

@Injectable()
export class CancelInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const signal = cancServer.getRequestSignal(http.getRequest().raw ?? http.getRequest(), http.getResponse().raw ?? http.getResponse());

    context.switchToHttp().getRequest().cancelSignal = signal;

    return next.handle();
  }
}
```

The `.raw ?? ` fallback is there because the fastify adapter wraps the node objects and the express adapter does not. Read the signal from the request inside your controller and pass it to a coroutine. Nest's own `RequestTimeout` handling and its `@Res()` escape hatch are orthogonal to this and untouched.

### AdonisJS

The HTTP context carries the node objects as `ctx.request.request` and `ctx.response.response`. A middleware installs the signal once, and the rest of the request reads it back.

```js
import * as cancServer from '@cancjs/server-node';

export default class CancelMiddleware {
  async handle(ctx, next) {
    ctx.cancelSignal = cancServer.getRequestSignal(ctx.request.request, ctx.response.response);

    await next();
  }
}
```

Adonis buffers the response body by default, so a handler that returns rather than streams still finishes its work before anything is written. Cancellation is what stops that work early; it is not something the response layer does for you.

### restify

restify handlers are node handlers with a `next`, so the node package applies with no adaptation at all.

```js
import * as cancServer from '@cancjs/server-node';
import * as canc from '@cancjs/coroutine';

server.get('/invoices/:id', async (req, res, next) => {
  const signal = cancServer.getRequestSignal(req, res);

  try {
    res.send(await canc.async(function* () {
      return yield* canc.await(invoices.findById(req.params.id));
    }, undefined, { signal }));
    next();
  } catch (error) {
    next(error);
  }
});
```

### Next.js Pages Router

An API route in `pages/api` receives `(req, res)` that extend the node objects, so the node package works there. The caveat is the deployment target rather than the framework: on a serverless platform the function may be invoked through a proxy that never forwards a client abort, in which case the signal never fires and the code still behaves correctly, just without early cancellation. See the unachievable list below.

```js
import * as cancServer from '@cancjs/server-node';
import * as canc from '@cancjs/coroutine';

export default async function handler(req, res) {
  const signal = cancServer.getRequestSignal(req, res);

  res.json(await canc.async(function* () {
    return yield* canc.await(invoices.findById(req.query.id));
  }, undefined, { signal }));
}
```

### Nuxt and h3

An h3 event exposes the node pair as `event.node.req` and `event.node.res` whenever it is running on a node server, which covers Nuxt's default output. Wire it in a server middleware and read it back in route handlers.

```js
import * as cancServer from '@cancjs/server-node';

export default defineEventHandler((event) => {
  event.context.cancelSignal = cancServer.getRequestSignal(event.node.req, event.node.res);
});
```

On a non-node h3 preset the `event.node` pair is absent or emulated. Use the web shape there and take the signal from `event.web?.request?.signal`, accepting whatever the target runtime actually delivers.

### FeathersJS

Feathers hooks are the natural place to want a signal and the one place that cannot produce one. A hook sees the service call, not the transport, so nothing in the hook context knows there is a socket at all. The signal has to be put into `params` by the transport layer before the hook ever runs.

```js
import * as cancServer from '@cancjs/server-node';

app.use((req, res, next) => {
  req.feathers.cancelSignal = cancServer.getRequestSignal(req, res);
  next();
});

app.service('invoices').hooks({
  before: {
    find: [(context) => {
      context.params.cancelSignal = context.params.cancelSignal ?? context.params.req?.feathers?.cancelSignal;
    }],
  },
});
```

Service methods then read `params.cancelSignal`. Calls that did not arrive over HTTP, an internal service call or a scheduled job, simply have no signal in `params`, and the method must treat that as normal rather than as an error.

## Frameworks on the Web shape

### Next.js App Router

A route handler in `app/` receives a Web `Request`. Pass its signal through.

```js
import * as canc from '@cancjs/coroutine';

export async function GET(request, { params }) {
  const invoice = await canc.async(function* () {
    return yield* canc.await(invoices.findById(params.id));
  }, undefined, { signal: request.signal });

  return Response.json(invoice);
}
```

The same deployment caveat as the Pages Router applies. Confirm the abort actually arrives on your hosting platform before you count on it.

### Elysia

Elysia hands the underlying `Request` to every handler on its context.

```js
import * as canc from '@cancjs/coroutine';

app.get('/invoices/:id', ({ params, request }) =>
  canc.async(function* () {
    return yield* canc.await(invoices.findById(params.id));
  }, undefined, { signal: request.signal }),
);
```

Elysia runs on Bun, so the reliability of that signal is Bun's, not Elysia's. See the Bun entry.

### Bun.serve

A `fetch` handler receives the `Request` directly, which makes this the plainest form of the web shape.

```js
Bun.serve({
  fetch(request) {
    return canc.async(function* () {
      const invoice = yield* canc.await(invoices.findById(idFrom(request)));

      return Response.json(invoice);
    }, undefined, { signal: request.signal });
  },
});
```

Bun's disconnect propagation into `request.signal` has changed across releases. Test it on the version you deploy rather than assuming it, and treat a signal that never fires as the expected degraded case rather than a bug in your handler.

### Oak

Oak on Deno keeps the original Web request reachable from the context, so the signal comes from there rather than from oak's own request wrapper.

```js
router.get('/invoices/:id', async (ctx) => {
  const signal = ctx.request.source?.signal;

  ctx.response.body = await canc.async(function* () {
    return yield* canc.await(invoices.findById(ctx.params.id));
  }, undefined, { signal });
});
```

`ctx.request.source` is present when oak is running on `Deno.serve` and absent on other adapters, which is why the optional access is not defensive noise. With no source there is no signal, and the handler runs uncanceled.

### Fresh

A Fresh route handler receives `(req, ctx)` where `req` is a Web `Request`.

```js
export const handler = {
  async GET(req, ctx) {
    const invoice = await canc.async(function* () {
      return yield* canc.await(invoices.findById(ctx.params.id));
    }, undefined, { signal: req.signal });

    return Response.json(invoice);
  },
};
```

### itty-router

itty-router does not own the request; it routes whatever you hand it. The recipe is therefore the recipe of the runtime you run it on. On Bun or Deno it is the web shape above. On Cloudflare Workers it is subject to the Workers limitation described below.

```js
router.get('/invoices/:id', (request) =>
  canc.async(function* () {
    const invoice = yield* canc.await(invoices.findById(request.params.id));

    return Response.json(invoice);
  }, undefined, { signal: request.signal }),
);
```

### Cloudflare Workers

The code is the web shape and the constraint is the platform. `request.signal` does not abort on client disconnect unless the `enable_request_signal` compatibility flag is set, and the behavior behind that flag has an open upstream issue (workerd#6832). Without the flag the recipe compiles, runs, and never cancels. Read the unachievable list before shipping it.

## Where this is not achievable

These are not omissions. Each one is a case where client-disconnect cancellation cannot be delivered, and knowing that in advance is worth more than a recipe that quietly does nothing.

**AWS Lambda has no client-disconnect detection.** Neither the buffered invocation mode nor the streamed one tells the function that the caller went away. `getRemainingTimeInMillis()` is a deadline, not a cancel signal, and belongs to the timeout concern rather than this one. AWS Powertools' event handler surfaces nothing extra. There is no Lambda cancellation recipe because there is nothing to build one on. Use a deadline instead, and accept that an abandoned request is billed in full.

**Cloudflare Workers need an opt-in flag.** Without `enable_request_signal` the request signal never aborts on disconnect. With it, behavior is still subject to the open issue linked above. Treat cancellation there as unavailable until you have verified it on your own account and compatibility date.

**A network drop without a FIN produces no event anywhere.** If the client's connection dies without a clean close, no runtime learns about it until the TCP layer times out, which can be minutes. This is fundamental and applies equally to every package in the family, not only to the recipes here. A handler deadline is the only defense.

**A buffering reverse proxy may swallow the abort.** When nginx, an ALB, a CDN or an API gateway buffers the response, the origin's connection stays open after the real client leaves, and the origin never sees a disconnect. Cancellation works perfectly and is simply never triggered. Check the buffering configuration of everything between the client and your process before concluding the wiring is broken.

**FeathersJS hooks cannot see the transport.** A hook has no access to the socket, so no hook can derive a signal on its own. The signal must be injected into `params` by transport-level middleware, as the recipe above shows. There is no way to make a hook that works for both an HTTP call and an internal service call without that injection step.

## Contributing a recipe

If you get one of these working on a framework not listed, or find that a recipe here is wrong for a current version, an issue or a pull request is welcome. Recipes are documentation, so a correction only needs a working sample and the version you tested against.

## Documentation

- [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for core cancellation semantics and `CancelError`
- [`@cancjs/coroutine`](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine) for the generator flavor used in every sample here
- [`@cancjs/server-node`](https://github.com/cancjs/canc/tree/master/packages/canc-server/canc-server-node) for the package every node-shape recipe builds on
- [Root README](https://github.com/cancjs/canc/blob/master/README.md) for monorepo overview
- [Examples](https://github.com/cancjs/canc/tree/master/examples) for application integration samples
