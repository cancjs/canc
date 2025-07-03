<p align="center">
 <img src="../../assets/canc-logo.png" width="483" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; a crafty foundation for cancelable promises">
</p>

<h1 align="center">@cancjs/decorators</h1>

<p align="center">
 <a href="https://travis-ci.org/vuetifyjs/vuetify">
 <img src="https://img.shields.io/travis/vuetifyjs/vuetify/dev.svg?style=flat-square" alt="Travis CI"></a>
 <a href="https://codecov.io/gh/vuetifyjs/vuetify">
 <img src="https://img.shields.io/codecov/c/github/vuetifyjs/vuetify.svg?style=flat-square" alt="Coverage"></a>
 <a href="https://github.com/vuetifyjs/vuetify/blob/master/LICENSE.md">
 <img src="https://img.shields.io/npm/l/vuetify.svg?style=flat-square" alt="License"></a>
 <!--<br>-->
 <a href="https://www.npmjs.com/package/react">
 <img src="https://flat.badgen.net/badgesize/normal/ex-machine/canc/packages/canc-decorators/dist/umd.min.js" alt="min bundle size"></a>
 <a href="https://www.npmjs.com/package/react">
 <img src="https://flat.badgen.net/badgesize/gzip/ex-machine/canc/packages/canc-decorators/dist/umd.min.js" alt="min+gzip bundle size"></a>
</p>

---
## Introduction

## Features

## Getting Started

### Installation

#### NPM

```
npm i -S @cancjs/decorators
```

#### Yarn

```
yarn add @cancjs/decorators
```

### Usage

## Class-method placement

`@AsyncMethod`/`@BindMethod` (and their `Legacy`/babel-legacy counterparts) wrap a method with
`cancAsync` from `@cancjs/coroutine`. Every flavor supports two placements, chosen by the `bind`
option:

| Placement | `bind` | Mechanism | `this` binding | Memory |
|---|---|---|---|---|
| **Proto-level** | `false` (default for `@AsyncMethod`) | decorator returns the wrapped fn, replacing the method on the prototype once | Late-bound — flows from call site (`obj.method()`) | One wrapped fn shared across all instances |
| **Per-instance** | `true` (default for `@BindMethod`) | `addInitializer` (ES stage-3) / lazy self-replacing own-property accessor (legacy, babel-legacy) installs an own, ctx-bound property on each instance | Early-bound — fixed to the instance | One wrapped fn per instance |

Default to proto-level (`bind:false`) unless the method is detached from its instance (passed as
a bare callback: `setTimeout(obj.method)`, event handler, prop). Only pay the per-instance cost
when you need the method to keep working without `.bind()` at the call site.

Getters and arrow-fn class fields are always memoized **per instance** regardless of `bind` —
memoizing a getter's produced function on the prototype was the original cross-instance
corruption bug (a class field's initial value is inherently per-instance already). `bind` only
changes whether the produced function itself is ctx-bound.

### `super` interaction

- Proto-level (`bind:false`) methods sit on the prototype like any normal method — `super.method()`
 from a subclass calls the wrapped parent implementation directly, standard prototype-chain
 lookup, no special handling needed.
- Per-instance (`bind:true`) methods are **own properties on the instance**, not on the
 prototype — they do not participate in `super` lookup. `super.method()` in a subclass still
 resolves to the *parent prototype's* method (unbound unless the parent's own initializer already
 ran for this instance). If a class hierarchy relies on `super.method()` reaching the
 cancelable/bound behavior, prefer proto-level placement (`bind:false`) at the level(s) `super`
 needs to reach, and reserve `bind:true` for leaf-class detachment cases.
- Subclasses overriding a decorated method need their own decorator to get coroutine/bound
 behavior on the override; the decorator does not propagate to overrides automatically (normal JS
 method-resolution rules apply).

### Memory implications

- Proto-level: **O(1)** — one wrapped function total, defined once at class-decoration time.
- Per-instance: **O(n)** in instance count. Each bound function closes over its instance. The
 2-instance isolation + GC regression tests (`decorators.spec.ts`, `decorators-legacy.spec.ts`)
 lock in that a discarded instance is still collectable (`FinalizationRegistry`) despite another
 instance's decorator-produced function remaining alive — this only holds because placement is a
 **self-replacing own-property** (own-property shadows the prototype accessor, or is installed
 directly via `addInitializer`), never a `Map`/registry keyed by property name living on the
 prototype. That old pattern pinned the first bound instance forever and leaked its bound method
 to every other instance — do not reintroduce a shared cache for `bind:true` placement.

### Decorator vs manual `cancAsync(this.method, this)`

The decorators are sugar over the same `cancAsync(fn, ctx)` call `@cancjs/coroutine` exposes
directly:

```ts
// decorator (bind:true) — per-instance
class Loader {
 @AsyncMethod({ bind: true })
 *load(url: string) { /* ... */ }
}

// manual equivalent, in the constructor
class Loader {
 constructor() {
 this.load = cancAsync(this.load, this);
 }
 *load(url: string) { /* ... */ }
}
```

```ts
// decorator (bind:false, default) — proto-level
class Loader {
 @AsyncMethod()
 *load(url: string) { /* ... */ }
}

// manual equivalent, outside the constructor
class Loader {
 *load(url: string) { /* ... */ }
}
Loader.prototype.load = cancAsync(Loader.prototype.load);
```

Use the decorator when your toolchain supports one of the three flavors (declarative, co-located,
consistent isolation guarantees already tested here). Fall back to manual wiring when decorators
aren't available, or when the wrap site needs to be something the decorator can't express (e.g.
conditional wrapping). Both paths carry the identical proto/instance memory tradeoff above — the
decorator does not add or remove overhead versus wiring `cancAsync` by hand.

### Inheritance cases

| Case | Behavior |
|---|---|
| Subclass doesn't override the decorated method | Inherits proto-level wrap as normal; `bind:true` methods get their own per-instance wrap because the initializer/accessor runs again for the subclass instance via the inherited constructor chain. |
| Subclass overrides, no decorator on override | Override is plain, not coroutine-wrapped/bound. |
| Subclass overrides with its own decorator | Independent wrap; see `super` interaction above for how `super.method()` behaves. |
| Same property decorated at multiple levels via mixins | Standard last-applied-wins prototype semantics; no coroutine-specific behavior. |

See `@cancjs/coroutine` README (`## Using coroutines as class methods`) for the coroutine-body
side of this (generator `super` calls, per-step memory inside `cancAsync` itself).

## Documentation

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](LICENSE)