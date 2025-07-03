<p align="center">
 <img src="../../assets/canc-logo.png" width="483" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; a crafty foundation for cancelable promises">
</p>

<h1 align="center">@cancjs/coroutine</h1>

---
## Introduction

Cancelable async/await replacement built on generators. `cancAsync` (aliased `async`) turns a
generator function into a function returning a `CancelablePromise`; `cancAwait` (aliased `await`,
used as `yield* cancAwait(promise)`) yields a value and resumes with its resolution, or throws on
rejection/cancellation.

## Features

## Getting Started

### Installation

#### NPM

```
npm i -S @cancjs/coroutine
```

#### Yarn

```
yarn add @cancjs/coroutine
```

### Usage

## Using coroutines as class methods

`cancAsync` just wraps a generator function into a plain function — it doesn't know or care
whether that function ends up as a class method. Getting `this` right, and controlling when the
bound wrapper is created, is on the caller. Two ways to do it: reach for
`@cancjs/decorators`, or call `cancAsync` by hand. This section covers both, plus the
proto-vs-instance tradeoff they share.

### Proto vs instance placement (decision table)

Same tradeoff as the decorators package (`@cancjs/decorators` README, D10-resolved). Applies
identically whether you use the decorator or wire `cancAsync` yourself:

| Placement | `this` binding | Memory | When |
|---|---|---|---|
| **Proto-level** (wrap once, put on prototype) | Late-bound — flows from call site (`obj.method()`) | One wrapped fn shared by all instances | Default. Cheapest, no per-instance cost, matches normal method semantics (works with `super.method()`, mixins, `Object.getPrototypeOf`). |
| **Per-instance** (wrap in constructor / initializer, own property) | Early-bound — fixed to the instance that created it | One wrapped fn **per instance** | Only when the method is detached and passed around as a bare reference (`setTimeout(obj.method)`, event handler, callback prop) and must keep working without `.bind()` at the call site. |

Default to proto-level. Only pay for per-instance binding when you actually detach the method.

### Decorator pattern (`@cancjs/decorators`)

```ts
import { AsyncMethod } from '@cancjs/decorators';

class Loader {
 @AsyncMethod() // proto-level wrap (default) — this flows from call site
 *load(url: string) {
 const data = yield* cancAwait(fetch(url));
 return data;
 }

 @AsyncMethod({ bind: true }) // per-instance — safe to detach: onClick={loader.load}
 *loadBound(url: string) {
 const data = yield* cancAwait(fetch(url));
 return data;
 }
}
```

See `@cancjs/decorators` README for the full proto/instance mechanism per decorator flavor
(ES stage-3, TS legacy, babel-legacy) and the getter/field cases.

### Manual pattern (`cancAsync(this.method, this)`)

No decorators available (older toolchain, no stage-3/experimentalDecorators), or want the wrap
site to be explicit — call `cancAsync` directly:

```ts
import { async as cancAsync } from '@cancjs/coroutine';

class Loader {
 constructor() {
 // per-instance, own property — equivalent to @AsyncMethod({ bind: true })
 this.load = cancAsync(this.load, this);
 }

 *load(url) {
 const data = yield* cancAwait(fetch(url));
 return data;
 }
}
```

Proto-level manual equivalent (wrap once, outside the constructor, no per-instance cost):

```ts
class Loader {
 *load(url) { /* ... */ }
}

Loader.prototype.load = cancAsync(Loader.prototype.load); // no ctx: this flows from call site
```

Decorator vs manual is purely ergonomics — same underlying `cancAsync(fn, ctx)` call, same
proto/instance memory tradeoff. Prefer the decorator when your toolchain supports it (declarative,
co-located with the method); fall back to manual wiring in the constructor or on the prototype
otherwise.

### `super` interaction

`cancAsync` wraps a generator function opaquely; it does not special-case `super`. Practical
consequences:

- Calling `super.method()` from inside a coroutine generator body works normally — `super` is
 resolved lexically at the class body, unaffected by the wrap.
- **Overriding a proto-wrapped coroutine method in a subclass and calling `super.method()`** invokes
 the wrapped (cancelable) parent version, same as calling any wrapped prototype method — the
 subclass override does not need its own `@AsyncMethod`, but if it wants cancelable behavior of
 its own body it needs its own wrap.
- **Per-instance (bind:true) placement does not participate in the prototype chain** — the bound
 version lives as an own property on the instance, so `super.method()` from a subclass still
 reaches the *parent's prototype* method (unbound, or bound only if the parent's own constructor
 already ran and set its own-instance property before the subclass body executes further
 binding). Prefer proto-level placement in class hierarchies where `super` calls into a coroutine
 method are expected; reserve `bind:true` for leaf classes / detached callback use.

### Memory notes

- Proto-level: **O(1)** wrapped functions regardless of instance count — the wrap happens once,
 at class-definition time.
- Per-instance (`bind:true`): **O(n)** wrapped functions, one per instance, each closing over that
 instance's `this`. Each also holds whatever the coroutine's own state closes over (the
 generator, in-flight step promises) for the lifetime of the bound function. Discarding the
 instance must drop the last reference to the bound function for it to be collectable — don't
 cache per-instance bound methods in a structure keyed by class/prototype (that's the exact
 cross-instance leak bug fixed in `@cancjs/decorators`, see its README and D10). Own-property
 (self-replacing) placement is what makes per-instance methods garbage-collectable once the
 instance itself is unreferenced.

### Inheritance cases

| Case | Behavior |
|---|---|
| Subclass does not override the coroutine method | Inherits the proto-level wrap (or, for `bind:true`, gets its own per-instance wrap via the same initializer/decorator applied by the base class). |
| Subclass overrides with its own generator, no decorator | Plain override; not cancelable unless it wraps itself. |
| Subclass overrides with its own `@AsyncMethod`/`cancAsync` | Independent wrap; `super.method()` reaches the parent's wrap (see `super` interaction above). |
| Mixins applying `@AsyncMethod` to the same key at multiple levels | Last applied wins on that prototype, standard JS method-resolution rules — no special coroutine behavior. |

Cross-linked from `@cancjs/decorators` README (`## Class-method placement`) — the mechanism table
there is the canonical source for the proto/instance decision; this page adds the coroutine-body
(`super`, generator-per-instance memory) specifics on top of it.

## Documentation

- [`yield` vs `yield*`](docs/yield-vs-yield-star.md) — why `yield* cancAwait(promise)` is typed and
 bare `yield promise` is not, the TypeScript limitation behind it, the typed combinator helpers
 (`cancAwait.all/race/any/allSettled`), and how redux-saga and MobX `flow` hit the same wall.

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](LICENSE)
