<div align="center">
  <img src="https://raw.githubusercontent.com/cancjs/canc/master/assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<h1 align="center">@cancjs/coroutine</h1>

<p align="center">
Cancelable generator-based drop-in replacements for <code>async</code>/<code>await</code> and async iterators.
</p>

---

## Introduction

An `async` function cannot be stopped from the outside. Its promise is created and driven by the
engine, and nothing in the language lets a caller interrupt the function between two `await`
points.

This package brings that control back. A generator function wrapped with `canc.async` returns a
[`CancelablePromise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise), and
every step written as `yield* canc.await(...)` is a point where cancellation can take effect. The
code keeps the shape of an `async` function, with `yield*` where `await` used to be.

`cancGen.async`, in the mirror namespace, does the same for `async function*`. The
[toolbox](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox) provides adapters for
wrapping existing APIs, and
[decorators](https://github.com/cancjs/canc/tree/master/packages/canc-decorators) bring coroutines
to class methods. See the [repository](https://github.com/cancjs/canc) for the full ecosystem.

## Features

- direct replacements for `async` functions and async generators
- cancellation reaches into a running coroutine, not just into the promise it returned
- full type inference through `yield*`, no casts and no `any` steps
- combinator helpers (`all`, `race`, `any`, `allSettled`, `try`) that preserve tuple types
- `for await` style consumption with per-item cancellation
- works as a class method, with or without decorators

## Getting Started

### Installation

```sh
npm install @cancjs/coroutine @cancjs/promise
```

`@cancjs/promise` is a peer dependency. This package is core tier: it follows strict semver, so
the default caret pin, `^1`, is safe. See
[Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md) for the full policy.

### Usage

```ts
import * as canc from '@cancjs/coroutine';

const loadInvoice = canc.async(function* (invoiceId: string) {
  const invoice = yield* canc.await(fetchInvoice(invoiceId));
  const customer = yield* canc.await(fetchCustomer(invoice.customerId));

  return { invoice, customer };
});

const pending = loadInvoice('inv-2041');

// Rejects the coroutine with a CancelError at its current step. The customer
// request is aborted if it is already in flight, and never starts otherwise.
pending.cancel();
```

Independent steps run together and cancel together:

```ts
const loadDashboard = canc.async(function* () {
  const [invoices, payments] = yield* canc.await.all([
    fetchInvoices(),
    fetchPayments()
  ]);

  return summarize(invoices, payments);
});
```

The flat names are exported next to the namespace aliases, so this is the same code:

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const loadInvoice = cancAsync(function* (invoiceId: string) {
  return yield* cancAwait(fetchInvoice(invoiceId));
});
```

## How It Works

### Where this comes from

Before `async`/`await` was standardized, libraries like `co` already wrote asynchronous code in
direct style: a generator yields a promise, a driver awaits it and resumes the generator with the
result. TC39 standardized this exact pattern as `async`/`await` in ES2017. An `async` function
compiles to a generator state machine with a built-in promise driver, the same architecture that
`co` used, but hidden inside the engine and hardcoded to native `Promise`.

Hiding the driver is what removes cancellation. Nobody outside the function holds the handle that
decides whether the next step should run at all. This package puts the driver back in userland.
The cost is a `yield*` per step. The gain is interruption at every one of them, with type inference
that `co` never had, combinator helpers that mirror `Promise.all`/`race`/`any`, and async generator
support for producing cancelable streams. The rest stays as close to native semantics as possible:
`return`, `throw`, `try`/`finally` and delegation to other generators all work the way they do in
an `async` function.

### What cancel does

Canceling the returned promise stops the coroutine at its current step. The step's promise is
canceled, the `CancelError` is thrown back into the generator at the point where it is suspended,
and the code after that point does not run.

Because the error is thrown into the generator, `try`/`catch` and `try`/`finally` behave the way
they do in an `async` function. A `finally` block still runs on cancellation, and its own steps
run shielded, so cleanup cannot be canceled halfway:

```ts
const checkout = canc.async(function* (orderId: string) {
  const reservation = yield* canc.await(reserveStock(orderId));

  try {
    return yield* canc.await(chargeCard(orderId));
  } finally {
    yield* canc.await(releaseReservation(reservation.id));
  }
});
```

### Why `yield*` and not `yield`

At runtime `yield promise` and `yield* canc.await(promise)` do the same thing. The difference is
typing. A bare `yield` is typed by the generator-wide next type, which TypeScript cannot narrow
per step, so the resumed value comes back as `unknown`. `canc.await(promise)` returns a one-shot
generator whose return type carries `Awaited<T>`, and `yield*` delegation reads that type back.
The starred form is the one to write.

The distinction also keeps the two yield roles separate. In the async generator namespace
(`cancGen.async`), a bare `yield` emits a value to the consumer, just as it does in a native
`async function*`. Using `yield*` for awaiting preserves that: `yield` means emit, `yield*` means
await. The same rule applies in the regular namespace for consistency.

The combinator helpers exist as `canc.await.all` and friends rather than plain statics for the
same reason: they reconstruct tuple inference across the delegation.

## Description

### Two namespaces

Both namespaces are the same runtime machinery with different mental models, and each has its own
entry point:

```ts
import * as canc from '@cancjs/coroutine'; // async/await world
import * as cancGen from '@cancjs/coroutine/gen'; // async function* world
```

In a `canc.async` body a bare `yield` is an await. In a `cancGen.async` body a bare `yield` emits
a value to the consumer, and awaiting is always written `yield* cancGen.await(...)`. Mixing
helpers from one namespace into a body of the other produces wrong values silently, so keep a body
in one dialect.

### Awaiting several things at once

`canc.await.all`, `.race`, `.any`, `.allSettled` and `.try` fold a combinator into a single step.
Cancellation semantics come from
[`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#combinators):
`race` and `any` cancel the losers, `all` cancels the rest on the first rejection.

```ts
const [profile, orders] = yield * canc.await.all([
  fetchProfile(id),
  fetchOrders(id)
]);
```

### Consuming an async iterable

`canc.forAwait` walks a source and runs a callback per item. Every pull is a cancellation point,
and canceling the coroutine closes the source:

```ts
const collectTokens = canc.async(function* (prompt: string) {
  let answer = '';

  yield* canc.forAwait(streamCompletion(prompt), (token) => {
    answer += token;

    if (answer.length > 4000) {
      return false; // stops the loop, the source is closed
    }
  });

  return answer;
});
```

The callback can be a plain function, a generator function, or a coroutine. Use a generator
function when the per-item work itself has to be cancelable:

```ts
yield* canc.forAwait(chunkStream, function* (chunk) {
  yield* canc.await(saveChunk(chunk));
});
```

`canc.forAwait.toArray(source)` collects a finite source into an array instead.

### Producing an async iterable

`cancGen.async` turns a generator function into a cancelable async generator. Inside it, `yield`
emits and `yield* cancGen.await(...)` awaits:

```ts
import * as cancGen from '@cancjs/coroutine/gen';

const exportVideo = cancGen.async(function* (chunkIds: string[]) {
  for (let index = 0; index < chunkIds.length; index++) {
    yield* cancGen.await(transcodeChunk(chunkIds[index])); // internal step
    yield Math.round(((index + 1) / chunkIds.length) * 100); // progress, emitted
  }
});

for await (const progress of exportVideo(chunkIds)) {
  updateProgressBar(progress);
}
```

`cancGen.forAwait` consumes another source from inside a producer without emitting its items, and
`cancGen.delegate(source)` re-emits them. Delegation needs its own helper because a synchronous
generator cannot `yield*` an async iterable.

### Class methods

`canc.async` wraps a generator function into a plain function, so placing it on a class is the
caller's decision. There are several ways to do it, depending on whether you use decorators and
whether you need TypeScript-correct types at the call site.

#### With decorators

The [decorators](https://github.com/cancjs/canc/tree/master/packages/canc-decorators) package
does it declaratively. The getter style is the recommended form in TypeScript:

```ts
import * as canc from '@cancjs/coroutine';
import { AsyncMethod } from '@cancjs/decorators';

class InvoiceService {
  @AsyncMethod()
  get load() {
    return canc.async(function* (this: InvoiceService, invoiceId: string) {
      return yield* canc.await(fetchInvoice(invoiceId));
    }, this);
  }

  @AsyncMethod({ bind: true }) // per instance, safe to detach as a callback
  get loadBound() {
    return canc.async(function* (this: InvoiceService, invoiceId: string) {
      return yield* canc.await(fetchInvoice(invoiceId));
    }, this);
  }
}
```

A getter's return type is inferred from its body, so `canc.async(...)` flows through correctly
and the call site sees `CancelablePromise<T>`.

In plain JavaScript the shorter method style works too, because there is no static type to be
wrong:

```js
class IssueClient {
  @AsyncMethod()
  *loadIssue(issueId) {
    return yield* canc.await(this.api.issue(issueId));
  }
}
```

In TypeScript, a method decorator cannot change the declared return type of the method it
decorates, so a decorated `*load()` generator keeps its generator type at the call site and every
caller needs a cast. Use the getter style instead.

#### With `asyncMethod` / `bindMethod`

Two helpers provide the same getter memoization without decorators. Call them in the constructor.
Both read the getter once, bind the result to the instance, and install it as an own property so
the getter is never called again. There is semantic difference: `asyncMethod` signals that the
member is a cancelable coroutine, `bindMethod` signals general binding for detach safety.
`asyncMethod` additionally guarantees that a method is wrapped with `canc.async`.

```ts
import * as canc from '@cancjs/coroutine';

class InvoiceService {
  constructor() {
    // per instance, equivalent to @AsyncMethod
    canc.asyncMethod(this, 'load');
  }

  get load() {
    return canc.async(function* (this: InvoiceService, invoiceId: string) {
      return yield* canc.await(fetchInvoice(invoiceId));
    }, this);
  }
}
```

#### Prototype assignment (JS only)

In plain JavaScript, a generator method can be replaced on the prototype directly:

```js
class InvoiceService {
  *load(invoiceId) {
    return yield* canc.await(fetchInvoice(invoiceId));
  }
}

InvoiceService.prototype.load = canc.async(InvoiceService.prototype.load);
```

This is the cheapest form: one wrapped function per class, shared by all instances. In
TypeScript, the call site still sees the generator's return type, and there is no clean way to
correct it. Interface merging to redeclare the method's type causes "overload signature not
compatible with its implementation signature". Use a getter style instead.

#### Class field

A class field avoids the prototype entirely, at the cost of one wrapped function per instance:

```ts
class InvoiceService {
  load = canc.async(function* (this: InvoiceService, invoiceId: string) {
    return yield* canc.await(fetchInvoice(invoiceId));
  }, this);
}
```

This is the simplest form for one-off classes, but the method does not participate in `super`
lookup and cannot be overridden from a subclass through the prototype chain.

### Things that do not work

- passing an `async function` or an `async function*` to `canc.async`. There is nothing to drive,
  and the call hangs or throws. Pass a plain generator function.
- `yield canc.await(x)` without the star. The step resumes with a generator object instead of the
  value, and cancellation is never wired.
- annotating a body as `Generator<unknown, T, any>`, or as `any`. Both collapse step types. Let
  inference do its work, or use `AsyncResult<T>` where a generator has no enclosing wrapper to
  carry its type.
- awaiting a plain, non-cancelable promise and expecting the work to stop. The chain stops, the
  operation does not. Make it cancelable at its source with `cancelify` or `promisify` from the
  [toolbox](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox).

## API

### `@cancjs/coroutine`

| Export                                                      | Alias           | Description                                                                |
| ----------------------------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| `cancAsync(genFn, ctx?, options?)`                          | `canc.async`    | Wraps a generator function into a function returning a `CancelablePromise` |
| `cancAwait(value)`                                          | `canc.await`    | One step, used as `yield* cancAwait(value)`                                |
| `cancAwait.all` / `.race` / `.any` / `.allSettled` / `.try` |                 | Combinators folded into a single step, tuple types preserved               |
| `cancForAwait(source, callback)`                            | `canc.forAwait` | Consumes an async or sync iterable, one cancellation point per item        |
| `cancForAwait.toArray(source)`                              |                 | Collects a source into an array                                            |
| `asyncMethod(instance, key)`                                |                 | Binds and memoizes a getter's coroutine as an own property                 |
| `bindMethod(instance, key)`                                 |                 | Binds and memoizes a getter's result as an own property                    |
| `BreakError`, `isBreakError`                                |                 | Breaking out of a stream from deeper code                                  |
| `AsyncResult<T>`                                            |                 | Return type for a generator body that has no enclosing wrapper             |

`options` are
[`CancelablePromise` options](https://github.com/cancjs/canc/tree/master/packages/canc-promise#options)
and configure the promise the coroutine returns. `ctx` sets `this` for the generator body.

### `@cancjs/coroutine/gen`

| Export                                                         | Alias              | Description                                                                       |
| -------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `cancGenAsync(genFn, options?)`                                | `cancGen.async`    | Wraps a generator function into a function returning a cancelable async generator |
| `cancGenAwait(value)`                                          | `cancGen.await`    | Internal step inside a producer, not emitted                                      |
| `cancGenAwait.all` / `.race` / `.any` / `.allSettled` / `.try` |                    | Same combinators for producer bodies                                              |
| `cancGenForAwait(source, callback)`                            | `cancGen.forAwait` | Consumes a source inside a producer without emitting its items                    |
| `cancGenForAwait.toArray(source)`                              |                    | Collects a source into an array                                                   |
| `cancGenDelegate(source)`                                      | `cancGen.delegate` | Re-emits another async iterable to the consumer                                   |
| `AsyncGenResult<E, R>`                                         |                    | Return type for a producer body, emit type and return type                        |

## Compatibility

Node.js 18 and later, current browsers, TypeScript 4.2 and later. Generators are required, so an
ES5 build target needs `downlevelIteration`. Everything else follows
[`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

## Documentation

- [`yield` vs `yield*`](docs/yield-vs-yield-star.md) for the typing limitation behind the starred
  form, and how redux-saga and MobX `flow` hit the same wall
- [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for the
  cancellation model itself
- [Decorators](https://github.com/cancjs/canc/tree/master/packages/canc-decorators) for class
  methods
- [Toolbox](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox) for making existing
  APIs cancelable
- [Examples](https://github.com/cancjs/canc/tree/master/examples): `demo-coroutine` for the
  basics, `app-ai-rag-pipeline` and `app-ws-progress` for streaming producers and consumers

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](./LICENSE)
