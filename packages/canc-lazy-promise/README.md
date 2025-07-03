<p align="center">
 <img src="../../assets/canc-logo.png" width="483" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; a crafty foundation for cancelable promises">
</p>

<h1 align="center">@cancjs/lazy-promise</h1>

## Introduction

A lazily-evaluated, cancelable promise-like. The executor is deferred until the value is first
subscribed with `then`, `catch`, `finally`, or `await`. Canceling before the first subscription
means the executor never runs. The result is cached: multiple subscribers share a single
execution, and the settled value is reused.

Unlike an observable, a `LazyPromise` stays a plain awaitable with standard A+ microtask ordering.
Unlike an eager `Promise`, nothing happens until someone actually wants the value.

## Getting Started

### Installation

```
npm install @cancjs/lazy-promise @cancjs/promise
```

`@cancjs/promise` is a peer dependency.

### Usage

```js
import { lazy } from '@cancjs/lazy-promise';

const value = lazy((resolve, reject, handleCancel) => {
 const id = setTimeout(() => resolve('done'), 1000);
 handleCancel(() => clearTimeout(id));
});

// The timer has not started yet.
const result = await value; // runs the executor now
```

The executor may also return a teardown function instead of (or in addition to) calling
`handleCancel`:

```js
const value = lazy((resolve) => {
 const id = setTimeout(() => resolve('done'), 1000);
 return () => clearTimeout(id);
});

value.cancel(); // teardown runs; timer cleared; executor result discarded
```

Canceling before the first subscription skips the executor entirely:

```js
const value = lazy(expensiveWork);
value.cancel(); // expensiveWork never runs
await value; // rejects with CancelError
```

### Resettable lazies

With `{ resettable: true }`, once every consumer cancels before the value settles, the teardown
runs and the lazy returns to its unstarted state, so a later subscription re-runs the executor:

```js
const value = lazy(subscribeToSource, { resettable: true });
```

### Choosing the promise implementation

Precedence, highest first: a per-call `options.impl`, the `LazyPromise.PromiseImpl` static, the
app-wide registry from `@cancjs/promise` (`setPromiseImpl`), then the built-in `CancelablePromise`.

```js
import { lazy } from '@cancjs/lazy-promise';

lazy(work, { impl: MyPromise });
```

### Native twin

`nativeLazy` (and the `NativeLazyPromise` class) back the value with a plain `Promise`. Laziness
and single-execution caching still apply; teardown registered by the executor still runs on
`cancel`, but there is no downward cancellation of in-flight work.

```js
import { nativeLazy } from '@cancjs/lazy-promise';

const value = nativeLazy((resolve) => resolve(compute()));
```
