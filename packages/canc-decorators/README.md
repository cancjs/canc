<div align="center">
  <img src="https://raw.githubusercontent.com/cancjs/canc/master/assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<h1 align="center">@cancjs/decorators</h1>

<p align="center">
Class method decorators for cancelable coroutines.
</p>

---

## Introduction

`@AsyncMethod` and `@BindMethod` wrap a class member with `cancAsync` from
[`@cancjs/coroutine`](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine), so
calling the member returns a
[`CancelablePromise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) instead
of a generator.

The same two decorators ship in three dialects, one per decorator syntax a toolchain can speak:
the standard decorators, the TypeScript legacy ones, and the Babel legacy ones. The behavior is
identical, only the wiring underneath differs.

## Features

- declarative cancelable methods, no manual wrapping in the constructor
- standard, TypeScript legacy and Babel legacy dialects, from separate entry points
- prototype-level or per-instance placement, chosen with one option
- methods, arrow-function class fields and getters are all supported
- per-instance placement that does not leak instances

## Getting Started

### Installation

```sh
npm install @cancjs/decorators @cancjs/coroutine @cancjs/promise
```

`@cancjs/coroutine` and `@cancjs/promise` are peer dependencies.

### Usage

```ts
import { AsyncMethod } from '@cancjs/decorators';
import { cancAsync, cancAwait } from '@cancjs/coroutine';

class IssueClient {
  @AsyncMethod()
  get loadIssue() {
    return cancAsync(function* (this: IssueClient, issueId: string) {
      const issue = yield* cancAwait(this.api.issue(issueId));
      const comments = yield* cancAwait(this.api.comments(issueId));

      return { issue, comments };
    }, this);
  }
}

const client = new IssueClient();
const pending = client.loadIssue('bug-118');

pending.cancel();
```

That is the getter style, which is the one to use in TypeScript. In plain JavaScript the shorter
method style works too:

```js
class IssueClient {
  @AsyncMethod()
  *loadIssue(issueId) {
    return yield* cancAwait(this.api.issue(issueId));
  }
}
```

## How It Works

The decorator replaces the member with the result of `cancAsync(fn, ctx)`. Where that replacement
lands is the one decision to make, and the `bind` option makes it:

| Placement       | `bind`                                  | Mechanism                                                                                                                            | `this` binding                       | Memory                                       |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | -------------------------------------------- |
| Prototype level | `false`, the default for `@AsyncMethod` | the decorator returns the wrapped function, replacing the method on the prototype once                                               | late bound, flows from the call site | one wrapped function shared by all instances |
| Per instance    | `true`, the default for `@BindMethod`   | an initializer (standard) or a self-replacing own-property accessor (legacy dialects) installs a bound own property on each instance | early bound, fixed to the instance   | one wrapped function per instance            |

Default to prototype level. Pay for per-instance binding only when the method is detached from its
instance and passed around as a bare reference, as in `setTimeout(client.loadIssue)` or a callback
prop.

Getters and arrow-function class fields are always memoized per instance, whatever `bind` says. A
getter's produced function must not be cached on the prototype, that was the original
cross-instance corruption bug, and a class field's initial value is per-instance to begin with.
The `bind` option only decides whether the produced function is bound to its context.

### `super` interaction

Prototype-level methods sit on the prototype like any other method, so `super.method()` from a
subclass calls the wrapped parent implementation through normal prototype lookup.

Per-instance methods are own properties on the instance and do not participate in `super` lookup.
`super.method()` in a subclass still resolves to the parent prototype's method, unbound unless the
parent's own initializer has already run for that instance. When a hierarchy relies on `super`
reaching the cancelable behavior, keep those levels at prototype placement and reserve
`bind: true` for leaf classes.

A subclass that overrides a decorated member needs its own decorator. Decoration does not
propagate to overrides, standard method-resolution rules apply.

### Memory

Prototype placement creates one wrapped function per class, at class definition time.
Per-instance placement creates one per instance, each closing over that instance.

A discarded instance stays collectable even while another instance's bound method is still alive.
That holds because placement is a self-replacing own property, never a cache keyed by property
name on the prototype. The old cached form pinned the first instance forever and handed its bound
method to every other instance, so do not reintroduce a shared cache for bound placement.

## Description

### Three dialects

| Entry point                       | Toolchain                                                           | Exports                     |
| --------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| `@cancjs/decorators`              | standard decorators (TypeScript 5, or Babel with the modern plugin) | `AsyncMethod`, `BindMethod` |
| `@cancjs/decorators/legacy`       | TypeScript with `experimentalDecorators`                            | `AsyncMethod`, `BindMethod` |
| `@cancjs/decorators/babel-legacy` | Babel with `@babel/plugin-proposal-decorators` in legacy mode       | `AsyncMethod`, `BindMethod` |

The main entry point also exports every dialect under an explicit name (`LegacyAsyncMethod`,
`LegacyBindMethod`, `BabelLegacyAsyncMethod`, `BabelLegacyBindMethod`) for code that has to mix
them, for example while migrating.

Both decorators can be applied bare or called with options:

```ts
@AsyncMethod          // bare
@AsyncMethod()        // called, same thing
@AsyncMethod({ bind: true })
```

### Method style and getter style

There are two ways to attach a coroutine to a class, and in TypeScript they are not
interchangeable.

Method style decorates a generator method directly. It is the shorter annotation, but a method
decorator cannot change the declared type of the method it decorates. TypeScript keeps seeing the
generator return type while at runtime the member returns a `CancelablePromise`, so every call
site needs a cast. This is a TypeScript limitation with no decorator-side fix. Use method style in
JavaScript, where there is no static type to be wrong, and avoid it in TypeScript.

Getter style sidesteps it. A getter's return type is inferred from its body, so the type of
`cancAsync(...)` flows through to the property and the call site gets
`CancelablePromise<T>` with no cast.

One boundary can still need a cast. A generator body's inferred value type does not always match
a separate interface that declares plain `Promise`-returning methods. When a decorated class has
to satisfy such an interface, the assignment needs a cast at class level, even though every call
runs the real coroutine and returns the right value at runtime. Calling `cancAsync` by hand with
no decorator hits exactly the same boundary.

### Getter semantics

A decorated getter is expected to return an already built coroutine, the result of
`cancAsync(fn, ctx?)`, not a bare generator function. On a getter the decorator never calls
`cancAsync` itself. It memoizes the getter's result on the instance, and optionally binds it.

`@AsyncMethod()` on a getter memoizes only, so the function keeps whatever binding `cancAsync`
gave it. `@BindMethod()` memoizes and calls `.bind(this)` on the result, which makes it
detach-safe whatever `cancAsync` was given. In both cases the result is cached per instance on
first access.

### The `, this` idiom

Passing the instance as the second argument of `cancAsync` binds the coroutine's `this` at
creation time, regardless of how the result is later called. That is the default to reach for: the
same body works under either decorator, called as a method or detached first.

It is not strictly required for a member that is always called as `client.method()`, since
call-site `this` resolves correctly there. It removes one failure mode: a coroutine created
without it and paired with `@AsyncMethod` throws once detached, because nothing supplies `this` at
call time. `@BindMethod` is a harmless no-op on a coroutine that already has its own context.

Typing `this` inside the body needs a `function (this: T)` parameter, which is a TypeScript-only
annotation and is erased at runtime.

### Without decorators

Getter-style decoration is sugar for building the coroutine once per instance and memoizing it.
Both plain forms below are valid TypeScript with no decorator at all, and give the same inferred
type:

```ts
// constructor field, built for every instance
class IssueClient {
  constructor() {
    this.loadIssue = cancAsync(function* (this: IssueClient, issueId: string) {
      return yield* cancAwait(this.api.issue(issueId));
    }, this);
  }
}

// class field, same thing without the constructor
class IssueClient {
  loadIssue = cancAsync(function* (this: IssueClient, issueId: string) {
    return yield* cancAwait(this.api.issue(issueId));
  }, this);
}
```

Choose a getter (built lazily on first access) or a field (built for every instance whether it is
used or not) by that tradeoff. The prototype-level manual equivalent is a single assignment:

```ts
IssueClient.prototype.loadIssue = cancAsync(IssueClient.prototype.loadIssue);
```

### Inheritance

| Case                                                   | Behavior                                                                                                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subclass does not override the member                  | Inherits the prototype-level wrap. A bound member gets its own per-instance wrap, because the initializer runs again through the constructor chain |
| Subclass overrides without a decorator                 | The override is plain, neither wrapped nor bound                                                                                                   |
| Subclass overrides with its own decorator              | An independent wrap, see the `super` notes above                                                                                                   |
| Same member decorated at several levels through mixins | Last applied wins, standard prototype semantics                                                                                                    |

## API

`AsyncMethod` and `BindMethod`, applicable to a method, an arrow-function field or a getter.
Both accept `{ bind?: boolean }`. `bind` defaults to `false` for `AsyncMethod` and `true` for
`BindMethod`.

The same pair is exported from `@cancjs/decorators/legacy` and `@cancjs/decorators/babel-legacy`,
and under the `Legacy` and `BabelLegacy` prefixes from the main entry point.

## Compatibility

Node.js 18 and later, current browsers. The standard entry point needs TypeScript 5.0 or later, or
Babel with the modern decorators plugin. The legacy entry point needs `experimentalDecorators`,
and the Babel legacy entry point needs `@babel/plugin-proposal-decorators` in legacy mode.
`reflect-metadata` is not required.

Everything else follows
[`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

## Documentation

- [Coroutines](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine#class-methods)
  for the coroutine side of class methods
- [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for the
  cancellation model
- [Examples](https://github.com/cancjs/canc/tree/master/examples): `demo-decorators` builds one
  client class in all three dialects plus the manual form, `app-angular` uses them in a service

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](./LICENSE)
