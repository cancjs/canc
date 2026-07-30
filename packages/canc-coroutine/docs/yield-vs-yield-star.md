# `yield` vs `yield*` in coroutines

A coroutine is a generator function driven by `cancAsync` (for promise chains) or `cancGenAsync`
(for async generators). Inside it you suspend on a promise and resume with its resolved value. There
are two ways to write that suspend point, and they differ only in what TypeScript infers for the
resumed value. The runtime behavior is identical.

## The two forms

Typed form, use this:

```ts
const data = yield* cancAwait(fetch(url)); // data: Response
```

Bare form, the untyped fallback:

```ts
const data = yield fetch(url); // data: unknown
```

Both suspend the coroutine on the same promise and resume with the same value. The difference is
purely at the type level: `yield*` gives you the resolved type, plain `yield` gives you `unknown`.

## Why plain `yield` cannot be typed

The type of a `yield` expression is the generator's "next" type parameter, the third slot of
`Generator<TYield, TReturn, TNext>`. That parameter is a single type shared by every `yield` in the
body. It describes what the driver passes back in on `gen.next(value)`, and it is the same for the
first yield and the hundredth. A coroutine yields many different promises (`Promise<Response>`, then
`Promise<User>`, then `Promise<void>`), each resolving to a different type, so there is no single
`TNext` that could be correct. TypeScript picks `unknown` (or `any`, depending on annotations), and
every plain `yield` in the body comes back as that one type. This is a language limitation, not a
gap in this library: the type of a `yield` expression cannot depend on the operand.

The relevant TypeScript issues:

- [microsoft/TypeScript#32523](https://github.com/microsoft/TypeScript/issues/32523) — request for
  per-yield contextual typing, closed as a design limitation. This is the canonical "why generators
  can't type their resumed values" thread.
- [microsoft/TypeScript#36967](https://github.com/microsoft/TypeScript/issues/36967) — open,
  tracking stronger inference for generator `next` values.
- [microsoft/TypeScript#43632](https://github.com/microsoft/TypeScript/issues/43632) — open,
  related proposal for typing the resumed value from the yielded operand.

Until one of those lands, `yield*` delegation is the only way to get a typed resumed value, and it
is a permanent part of the design here rather than a workaround for a bug that will be fixed.

## Why `yield*` works

`yield*` delegates to another generator and evaluates to that generator's return value, whose type
is the delegate's `TReturn`, the second slot of `Generator<TYield, TReturn, TNext>`. `cancAwait(p)`
returns a generator typed as `Generator<..., Awaited<T>, ...>`, so `yield* cancAwait(p)` evaluates to
`Awaited<T>`. Because the return type is per-call rather than shared across the whole body, each
`yield* cancAwait(...)` gets its own correct type. That is the whole trick: move the value out of the
un-typeable `TNext` slot and into the `TReturn` slot, which delegation reads accurately.

In the mirror generator namespace, `cancGenAwait(p)` works the same way: it returns a generator typed
to delegate, so `yield* cancGenAwait(p)` inside a `cancGenAsync` body resumes with the correct
resolved type, no cast required.

## Combinator helpers

`cancAwait` also carries one-shot combinator helpers so you keep tuple inference when awaiting several
promises at once:

```ts
const [user, posts] = yield* cancAwait.all([fetchUser(id), fetchPosts(id)]);
// ^ User ^ Post[] — a tuple, not unknown[]

const first = yield* cancAwait.race([slow(), fast()]);
const winner = yield* cancAwait.any([primary(), backup()]);
const results = yield* cancAwait.allSettled([a(), b()]);
```

Each helper builds the matching `CancelablePromise.all/race/any/allSettled`, yields that single
promise, and resumes with its result. At runtime the driver still awaits exactly one value, so
`cancAwait.all([...])` behaves the same as yielding a hand-built `CancelablePromise.all([...])`; the
helper exists only to carry the tuple types across the `yield*` boundary.

## How other libraries hit the same wall

This is not unique to canc. Any generator-driven async abstraction runs into the same `TNext`
limitation and adopts a similar convention.

- **redux-saga** yields plain effect objects (`yield call(api, id)`), so the resumed value comes back
  `unknown` and must be annotated or cast (`const x: Foo = yield call(...)`). Its typed-effects
  helpers exist specifically to work around this, and the community `typed-redux-saga` package
  reintroduces the typed values through the exact `yield*` delegation trick used here.
- **MobX** `flow` wraps a generator so `yield somePromise` runs like `await`, but the yielded value
  is typed `unknown` for the same reason, and its `flow` typings recommend casting the result. MobX
  documents this as an inherent generator constraint.

The takeaway is the same everywhere: prefer the `yield*` delegated form for typed values, and reach
for a bare `yield` (with an explicit annotation or cast) only when delegation is inconvenient.
