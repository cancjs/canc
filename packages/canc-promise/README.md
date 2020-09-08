<p align="center">
  <img src="../../assets/canc-logo.png" width="483" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; a crafty foundation for cancelable promises">
</p>

<h1 align="center">@cancjs/promise</h1>

<p align="center">
  <a href="https://travis-ci.org/vuetifyjs/vuetify">
    <img src="https://img.shields.io/travis/vuetifyjs/vuetify/dev.svg?style=flat-square" alt="Travis CI"></a>
  <a href="https://codecov.io/gh/vuetifyjs/vuetify">
    <img src="https://img.shields.io/codecov/c/github/vuetifyjs/vuetify.svg?style=flat-square" alt="Coverage"></a>
  <a href="https://github.com/vuetifyjs/vuetify/blob/master/LICENSE.md">
    <img src="https://img.shields.io/npm/l/vuetify.svg?style=flat-square" alt="License"></a>
  <!--<br>-->
  <a href="https://www.npmjs.com/package/react">
    <img src="https://flat.badgen.net/badgesize/normal/ex-machine/canc/packages/canc-promise/dist/umd.min.js" alt="min bundle size"></a>
  <a href="https://www.npmjs.com/package/react">
    <img src="https://flat.badgen.net/badgesize/gzip/ex-machine/canc/packages/canc-promise/dist/umd.min.js" alt="min+gzip bundle size"></a>
</p>

<p align="center">
Cancelable promise ecosystem based on native <code>Promise</code>: coroutines, async iterators, decorators, utilities, third-party library helpers.
</p>

---

<!--
## Table of Contents
-->

## Introduction

## Features

* cancelable promise implementation built on top of ES Promise
* UMD and ESM builds for modern and legacy browsers and Node.js
* TypeScript-ready

## Getting Started

### Installation

#### NPM

```
npm i -S @cancjs/promise
```

#### Yarn

```
yarn add @cancjs/promise
```

### Usage

## Documentation

## How It Works

Cancellation is a special form of promise rejection with cancel error that triggers registered handlers for the entire cancellation-aware promise chain.

`canc` promises implement two-way cancellation mechanism that treats promise chains as subscriptions:

* cancellation propagates down the promise chain when parent promise is canceled

* cancellation bubbles up the chain when all child promises are canceled and parent promise value is no longer consumed

Cancellation bubbling can be explicitly disabled on parent promise in case a promise causes side effects that shouldn't be implicitly discarded.

## Compatibility

The package relies on following ECMAScript 2015+ features: `Symbol`, `Reflect`, `Promise` (ES2018 for `finally`, ES2020 for `allSettled`), `Object.assign`, `Object.setPrototypeOf`.

### Native Support

Supported in modern browsers and Node.js:

* Node.js 6
* Chrome 49
* Opera 36
* Edge 12
* Firefox 42
* Safari macOS/iOS 10
* Android 7 (WebView)

### Polyfilled Support

Supported in legacy browsers and Node.js with `core-js` or `polyfill.io`:

* Node.js 0.10
* Chrome 5
* Opera 12
* Edge 12
* IE 11
* Firefox 4
* Safari macOS/iOS 5
* Android 4.4 (WebView, browser)

The incompatibility between native and polyfilled `Promise` and `Reflect` in engines with incomplete ES6 support requires to match globals before polyfilling:

<details>
  <summary>In cross-platform modular environment</summary>

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
  <summary>In browsers</summary>

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