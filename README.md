<h1 align="center">
  <img src="./assets/canc-logo.png" width="725" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; a crafty foundation for cancelable promises">
</h1>

<p align="center">
  <a href="https://travis-ci.org/vuetifyjs/vuetify">
    <img src="https://img.shields.io/travis/vuetifyjs/vuetify/dev.svg?style=flat-square" alt="Travis CI"></a>
  <a href="https://github.com/vuetifyjs/vuetify/blob/master/LICENSE.md">
    <img src="https://img.shields.io/npm/l/vuetify.svg?style=flat-square" alt="License"></a>
  <a href="#contributing">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome"></a>
</p>

<p align="center">
Cancelable promise ecosystem based on native <code>Promise</code>: coroutines, async iterators, decorators, utilities, third-party library helpers.
</p>

---

<!--
## Table of Contents

## Introduction
-->
## Features

* cancelable promise implementation built on top of ES Promise
* generator-based cancelable replacements for `async..await` and async iterators
* lazily evaluated cancelable promises
* cancelable Fetch API
* utility toolbox (`delay`, `timeout`, etc)
* <!--* framework helpers (Angular, Express, React, Vue)--> library helpers (Axios, Bluebird, RxJS, etc)
* decorators for TypeScript and Babel
* base packages to be used with custom promise implementation
* UMD and ESM builds for modern and legacy browsers and Node.js
* TypeScript-ready

## Packages

### Cancelable Promises

Cancellation-aware promise utilities:

<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Version</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href="https://github.com/ex-machine/canc/tree/master/packages/canc-promise">@cancjs/promise</a>
      </td>
      <td>
        <a href="https://www.npmjs.com/package/@cancjs/promise">
          <img src="https://img.shields.io/npm/v/@cancjs/promise.svg?style=flat-square" alt="Version">
        </a>
      </td>
      <td>
        Cancelable promise implementation based on ES Promise
      </td>
    </tr>
    <tr>
      <td>
        <a href="https://github.com/ex-machine/canc/tree/master/packages/canc-coroutine">@cancjs/coroutine</a>
      </td>
      <td>
        <a href="https://www.npmjs.com/package/@cancjs/coroutine">
          <img src="https://img.shields.io/npm/v/@cancjs/coroutine.svg?style=flat-square" alt="Version">
        </a>
      </td>
      <td>
        Cancelable generator-based drop-in replacements for <code>async..await</code> and async iterators
      </td>
    </tr>
    <tr>
      <td>
        <a href="https://github.com/ex-machine/canc/tree/master/packages/canc-fetch">@cancjs/fetch</a>
      </td>
      <td>
        <a href="https://www.npmjs.com/package/@cancjs/fetch">
          <img src="https://img.shields.io/npm/v/@cancjs/fetch.svg?style=flat-square" alt="Version">
        </a>
      </td>
      <td>
        Cross-platform Fetch API that uses cancelable promises
      </td>
    </tr>
    <tr>
      <td>
        <a href="https://github.com/ex-machine/canc/tree/master/packages/canc-lazy-promise">@cancjs/lazy-promise</a>
      </td>
      <td>
        <a href="https://www.npmjs.com/package/@cancjs/lazy-promise">
          <img src="https://img.shields.io/npm/v/@cancjs/lazy-promise.svg?style=flat-square" alt="Version">
        </a>
      </td>
      <td>
        Cancelable lazily evaluated promise-like class
      </td>
    </tr>
    <tr>
      <td>
        <a href="https://github.com/ex-machine/canc/tree/master/packages/canc-toolbox">@cancjs/toolbox</a>
      </td>
      <td>
        <a href="https://www.npmjs.com/package/@cancjs/toolbox">
          <img src="https://img.shields.io/npm/v/@cancjs/toolbox.svg?style=flat-square" alt="Version">
        </a>
      </td>
      <td>
        A collection of cancellation-aware promise helper functions and ponyfills
      </td>
    </tr>
  </tbody>
</table>

### Native Promises

General-purpose promise utilities that use built-in `Promise` as promise implementation where applicable:

<table>
  <thead>
    <tr>
      <th>Package</th>
      <th>Version</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href="https://github.com/ex-machine/canc/tree/master/packages/canc-coroutine-native">@cancjs/coroutine-native</a>
      </td>
      <td>
        <a href="https://www.npmjs.com/package/@cancjs/coroutine-native">
          <img src="https://img.shields.io/npm/v/@cancjs/coroutine-native.svg?style=flat-square" alt="Version">
        </a>
      </td>
      <td>
        Generator-based drop-in replacements for <code>async..await</code> and async iterators
      </td>
    </tr>
    <tr>
      <td>
        <a href="https://github.com/ex-machine/canc/tree/master/packages/canc-lazy-promise-native">@cancjs/lazy-promise-native</a>
      </td>
      <td>
        <a href="https://www.npmjs.com/package/@cancjs/lazy-promise-native">
          <img src="https://img.shields.io/npm/v/@cancjs/lazy-promise-native.svg?style=flat-square" alt="Version">
        </a>
      </td>
      <td>
        Lazily evaluated promise-like class
      </td>
    </tr>
    <tr>
      <td>
        <a href="https://github.com/ex-machine/canc/tree/master/packages/canc-toolbox">@cancjs/toolbox</a>
      </td>
      <td>
        <a href="https://www.npmjs.com/package/@cancjs/toolbox">
          <img src="https://img.shields.io/npm/v/@cancjs/toolbox.svg?style=flat-square" alt="Version">
        </a>
      </td>
      <td>
        A collection of promise helper functions
      </td>
    </tr>
  </tbody>
</table>

<!--
### Abstractions

Base packages that can be provided with custom promise implementation and environment-dependent global dependencies:
-->

## How It Works

Cancellation is a special form of promise rejection with cancel error that triggers registered handlers for the entire cancellation-aware promise chain.

`canc` promises implement two-way cancellation mechanism that treats promise chains as subscriptions:

* cancellation propagates down the promise chain when parent promise is canceled

* cancellation bubbles up the chain when all child promises are canceled and parent promise value is no longer consumed

Cancellation bubbling can be explicitly disabled on parent promise in case a promise causes side effects that shouldn't be implicitly discarded.

Two-way cancellation mechanism is supported for all common ways to establish a promise chain, including `all`, `race`, etc composition methods and coroutine `yield`.

A chain is cancelable only if it consists of `canc` promises. This requires to use cancellation-aware wrappers for Fetch API and third-party librararies, `async` and `async*` need to be replaced with cancelable generator-based coroutines.

## Motivation

Promise cancellation is highly beneficial in real life scenarios yet it's not a part of existing ECMAScript specification. JavaScript API like Fetch `AbortController` use their own mechanisms that aren't unified with native promises.

<!-- applies to frontend and backend development -->

A situation that is common in modern JavaScript applications is that a process like network request that stands behind long-running asynchronous task is abortable, consumers need to unsubscribe from results and abort initial process when it's no longer needed. This eventually becomes harder with uncancelable promises when a task is composed of smaller independent tasks.

See [examples](#examples) for more use cases.

<!--
### Frontend Use Cases

* Long-running promise tasks cannot be easily disposed on route navigation cancel or component destroy
* Angular doesn't support change detection inside native `async`
* React; this is handled with state management with side effects like Redux Saga
-->

### Background

* **No official solution**. [Native cancelable promises](https://github.com/tc39/proposal-cancelable-promises) were incompatible with ES6 promise semantics, provided one-way cancellation, used unwieldy cancel tokens and have been abandoned.

* **Bluebird stepped aside**. Bluebird has bulky stable API and has been largely superseded by ES promises where applicable, particularly due to `async..await`. [Two-way cancellation](http://bluebirdjs.com/docs/api/cancellation.html) is disabled by default and incompatible with native promise semantics.

* **No universal third-party options**. JavaScript community provides no comprehensive alternatives based on native promises. Renowned `p-*` [package collection](https://github.com/sindresorhus/promise-fun#packages) only supports one-way cancellation and targets Node.js.

* **Observables aren't a magic bullet**. Observables can provide a superset of promise features, as well as cancellation. However, observables don't offer expressive sugar similar to `async..await`, cancellation may be lost in promise interop. Observables are push-based and cannot displace pull-based `async*` async iterators. [RxJS](https://github.com/ReactiveX/rxjs) is commonly used implementation with complex API, no [native observable](https://github.com/tc39/proposal-observable) implementation exists yet.


<!--
## Getting Started

### Installation

### Usage

## Documentation
-->

## Compatibility

Packages rely on following ECMAScript 2015+ features: `Symbol` (ES2018 for async iterators), `Reflect`, `Promise` (ES2018 for `finally`, ES2020 for `allSettled`), `Object.assign`, `Object.setPrototypeOf`.

### Native Support

Supported in modern browsers and Node.js:

* Chrome 49
* Opera 36
* Edge 12
* Firefox 42
* Safari macOS/iOS 10
* Android 7 (WebView)
* Node.js 6

### Polyfilled Support

Supported in legacy browsers and Node.js with `core-js` or `polyfill.io`:

* Chrome 5
* Opera 12
* Edge 12
* IE 11
* Firefox 4
* Safari macOS/iOS 5
* Android 4.4 (WebView, browser)
* Node.js 0.10

The incompatibility between native and polyfilled `Promise` and `Reflect` in engines with incomplete ES6 support (Node.js 0.12 to 5, etc) requires to match globals before polyfilling:

<details>
  <summary>Modular environment</summary>

```js
var _global = typeof globalThis !== 'undefined' && globalThis
  || typeof self !== 'undefined' && self
  || typeof global !== 'undefined' && global;

if (!('Reflect' in _global) && 'Promise' in _global)
  delete _global.Promise;

require('core-js/stable');
```
</details>


<details>
  <summary>Browser webpage</summary>

```html
<script>
if (!('Reflect' in window) && 'Promise' in window)
  delete window.Promise;
</script>
<!-- no es2020 allSettled yet -->
<script src="https://polyfill.io/v3/polyfill.min.js?features=es2015,es2018&flags=always,gated"></script>
```
</details>

## Examples

Can be found in [examples](https://github.com/ex-machine/canc/tree/master/examples) section.

<!--
### Component with uncancelable promises:

```js
class Component {
  createHook() {
    fetchFooBar();
  }

  async fetchFooBar() {
    let foo = await fetchFoo();

    // safeguard
    if (this._destroyed)
        return;

    // the framework causes an error if the instance has been destroyed
    this.updateState({ foo });

    // cannot be stopped even if the result isn't needed
    let bar = await fetchBar({ foo, retries: 10 });

    // safeguard
    if (this._destroyed)
        return;

    this.updateState({ bar });
  }

  destroyHook() {
    this._destroyed = true;
  }
}
```


```js
class Component {
  createHook() {
    fetchFooBarBaz();
  }

  async fetchFooBarBaz() {
    // retries cannot be stopped even if they aren't usable
    let one = await fetchFoo({ retryTimes: 5});
    if (this._destroyed) return;
    this.updateState({ one });
    let two = await actionTwo(one);
    if (this._destroyed) return;
    this.updateState({ one });
  }

  destroyHook() {
    this._destroyed = true;
  }
}
```
-->

<!--
## Related

## Status
-->



## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](LICENSE)