<p align="center">
 <img src="../../assets/canc-logo.png" width="483" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; a crafty foundation for cancelable promises">
</p>

<h1 align="center">@cancjs/decorators</h1>

<p align="center">
 <a href="../../LICENSE">
 <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
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

`@AsyncMethod`/`@BindMethod` (and the `Legacy`/`BabelLegacy` counterparts for the other two
decorator flavors) apply to three kinds of class members: methods, arrow-fn fields, and getters.
Method and field decoration wraps a generator function with `cancAsync` for you. Getter decoration
works differently and is the one to reach for in TypeScript (see below).

## Two styles: method/field vs getter

There are two ways to attach a coroutine to a class, and they are not interchangeable in
TypeScript.

**Method style** (`@AsyncMethod() *load() { ... }`) decorates a generator method directly. It is
the shorter annotation, but a method decorator cannot change the declared type of the method it
decorates: TypeScript still sees the method's return type as the generator, while at runtime
`cancAsync` has replaced it with a function returning a `CancelablePromise`. Every call site sees
the wrong type and needs a cast to use the real return value. This is a TypeScript limitation, not
a bug in this package, and there is no decorator that fixes it. Use method style in plain JavaScript,
where there is no static type to be wrong; do not use it in TypeScript.

**Getter style** (`@AsyncMethod() get load() { return cancAsync(fn, this) }`) sidesteps the problem:
a getter's return type is inferred from its body like any other function, so `cancAsync`'s return
type flows through to the property. Calling `loader.load(url)` directly on the class gets the real,
specific type (`CancelablePromise<Data>`), no cast.

The decorated getter's own member type is exact: no cast is needed to call it directly on the class
or to read its return type. One separate boundary can still need a cast: `cancAsync` itself returns
a `CancelablePromise` typed by what the generator body infers, and a generator body's inferred
value type does not always match a shared interface's declared return value one for one. If a
decorated class needs to satisfy an independent, undecorated interface (a shared shape with plain
`Promise`-returning methods, used to treat several implementations uniformly) and that mismatch
shows up, the assignment needs a cast at the class level, even though every call still runs the
real coroutine and returns a real `CancelablePromise` with the right runtime value. This is not a
decorator limitation: the same cast would be needed calling `cancAsync` directly with no decorator
at all.

```ts
// Getter style (TypeScript): correct type, no cast at the call site
class Loader {
 @AsyncMethod()
 get load() {
 return cancAsync(function* (this: Loader, url: string) {
 const data = yield* cancAwait(fetch(url));
 return data;
 }, this);
 }
}

const loader = new Loader();
loader.load('/x'); // CancelablePromise<Data>, inferred

// Method style (JavaScript only): type-unsafe if used in TypeScript
class Loader {
 @AsyncMethod()
 *load(url) {
 const data = yield* cancAwait(fetch(url));
 return data;
 }
}
```

### Getter semantics

The getter is expected to return an already-built coroutine (whatever `cancAsync(fn, ctx?)`
returns), not a bare generator function. The decorator's job on a getter is narrower than on a
method: it never calls `cancAsync` itself, it only memoizes the getter's result on the instance,
and optionally binds it.

- `@AsyncMethod() get x() { return cancAsync(fn) }` memoizes only. The returned function keeps
 whatever `this` binding `cancAsync` gave it: if the coroutine's second argument was omitted,
 that means call-site `this` (works as `instance.x()`, breaks if detached: `const f = instance.x;
 f()` fails because `this` is `undefined` inside the coroutine).
- `@BindMethod() get x() { return cancAsync(fn) }` memoizes and additionally calls `.bind(this)`
 on the result, so the memoized function is detach-safe regardless of what `cancAsync` was given.

Getter results are always memoized per instance (first access builds and caches; later accesses
return the same function), independent of the `bind` option and independent of any other
instance's getter of the same name.

### The `, this` idiom

`cancAsync(fn, this)` (passing the instance as `cancAsync`'s second argument) binds the
coroutine's `this` at creation time, regardless of how the result is later called or whether
`@BindMethod` also binds it. This is the default to reach for: the same getter body works whether
the decorator is `@AsyncMethod` or `@BindMethod`, and whether the result is called as a method or
detached first.

Passing `, this` is not strictly required for a method that is always called as
`instance.method()` (plain call-site `this` already resolves correctly there), but it is the
idiom to reach for by default, because it removes one failure mode: a coroutine created without
`, this` and paired with `@AsyncMethod` (not `@BindMethod`) throws once detached, since nothing
supplies `this` at call time.

`@BindMethod`'s own `.bind(this)` is a harmless no-op on a coroutine already created with `, this`
(the coroutine ignores the caller-supplied `this` once it has its own bound context). It only
matters when the coroutine was built without `, this`; then `@AsyncMethod` leaves it call-site
bound and `@BindMethod` binds it for you.

Typing `this` inside the coroutine body needs a `function (this: T) { ... }` parameter (a
TypeScript-only annotation, erased at runtime) regardless of which idiom is used.

### No-decorator equivalents

Getter-style decoration is sugar for building the coroutine once per instance and memoizing it
yourself. Both forms are valid TypeScript with no decorator at all:

```ts
// Constructor field, eager
class Loader {
 constructor() {
 this.load = cancAsync(function* (this: Loader, url: string) {
 const data = yield* cancAwait(fetch(url));
 return data;
 }, this); // call-site `this` == whatever `, this` above bound; equivalent to @AsyncMethod
 }
}

// Class field, eager, no constructor needed
class Loader {
 load = cancAsync(function* (this: Loader, url: string) {
 const data = yield* cancAwait(fetch(url));
 return data;
 }, this);
}
```

Pick a getter (lazy: built on first access) or a field (eager: built for every instance whether or
not it is used) by that tradeoff. Both give the same inferred type as the decorated getter, with no
decorator required.

## Class-method placement

`@AsyncMethod`/`@BindMethod` (and their `Legacy`/babel-legacy counterparts) wrap a method with
`cancAsync` from `@cancjs/coroutine`. Every flavor supports two placements, chosen by the `bind`
option:

| Placement | `bind` | Mechanism | `this` binding | Memory |
|---|---|---|---|---|
| **Proto-level** | `false` (default for `@AsyncMethod`) | decorator returns the wrapped fn, replacing the method on the prototype once | Late-bound (flows from call site, `obj.method()`) | One wrapped fn shared across all instances |
| **Per-instance** | `true` (default for `@BindMethod`) | `addInitializer` (ES stage-3) / lazy self-replacing own-property accessor (legacy, babel-legacy) installs an own, ctx-bound property on each instance | Early-bound (fixed to the instance) | One wrapped fn per instance |

Default to proto-level (`bind:false`) unless the method is detached from its instance (passed as
a bare callback: `setTimeout(obj.method)`, event handler, prop). Only pay the per-instance cost
when you need the method to keep working without `.bind()` at the call site.

Getters and arrow-fn class fields are always memoized **per instance** regardless of `bind`
(memoizing a getter's produced function on the prototype was the original cross-instance
corruption bug; a class field's initial value is inherently per-instance already). `bind` only
changes whether the produced function itself is ctx-bound.

### `super` interaction

- Proto-level (`bind:false`) methods sit on the prototype like any normal method. `super.method()`
 from a subclass calls the wrapped parent implementation directly, standard prototype-chain
 lookup, no special handling needed.
- Per-instance (`bind:true`) methods are **own properties on the instance**, not on the
 prototype, so they do not participate in `super` lookup. `super.method()` in a subclass still
 resolves to the *parent prototype's* method (unbound unless the parent's own initializer already
 ran for this instance). If a class hierarchy relies on `super.method()` reaching the
 cancelable/bound behavior, prefer proto-level placement (`bind:false`) at the level(s) `super`
 needs to reach, and reserve `bind:true` for leaf-class detachment cases.
- Subclasses overriding a decorated method need their own decorator to get coroutine/bound
 behavior on the override; the decorator does not propagate to overrides automatically (normal JS
 method-resolution rules apply).

### Memory implications

- Proto-level: **O(1)**, one wrapped function total, defined once at class-decoration time.
- Per-instance: **O(n)** in instance count. Each bound function closes over its instance. The
 2-instance isolation + GC regression tests (`decorators.spec.ts`, `decorators-legacy.spec.ts`)
 lock in that a discarded instance is still collectable (`FinalizationRegistry`) despite another
 instance's decorator-produced function remaining alive. This only holds because placement is a
 **self-replacing own-property** (own-property shadows the prototype accessor, or is installed
 directly via `addInitializer`), never a `Map`/registry keyed by property name living on the
 prototype. That old pattern pinned the first bound instance forever and leaked its bound method
 to every other instance; do not reintroduce a shared cache for `bind:true` placement.

### Decorator vs manual `cancAsync(this.method, this)`

The decorators are sugar over the same `cancAsync(fn, ctx)` call `@cancjs/coroutine` exposes
directly:

```ts
// decorator (bind:true), per-instance
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
// decorator (bind:false, default), proto-level
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
conditional wrapping). Both paths carry the identical proto/instance memory tradeoff above; the
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