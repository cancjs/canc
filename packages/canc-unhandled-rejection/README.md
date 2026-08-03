<div align="center">
  <img src="https://raw.githubusercontent.com/cancjs/canc/master/assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<h1 align="center">@cancjs/unhandled-rejection</h1>

<p align="center">
Global handler that silences CancelError rejections from @cancjs/promise.
</p>

---

## Introduction

A canceled promise rejects with a `CancelError` by design. When a canceled promise is left without a rejection handler, JavaScript runtimes trigger an `unhandledRejection` event. In Node.js 15 and later, unhandled rejections terminate the process with a non-zero exit code.

This package registers a global rejection handler that filters out `CancelError` rejections while letting real errors pass through to default environment error handling or custom application callbacks. Adding a single import at your entry point prevents expected cancellation flow from crashing your application.

## Features

- Automatic environment detection supporting Node.js, Deno, Bun, web browsers, Web Workers, Service Workers, Cloudflare Workers, and Electron
- One-line side-effect import for zero-config global registration
- Explicit registration API with process-specific and environment-specific methods
- Optional suppression scope widening for `AbortError` and `TimeoutError`
- Synchronous custom callback support for custom logging or telemetry forwarding
- Per-call and global warning controls for diagnostic feedback
- Environment-safe guards that never throw in non-supported or custom JavaScript environments

## Getting Started

### Installation

```sh
npm install @cancjs/unhandled-rejection @cancjs/promise
```

`@cancjs/promise` is a peer dependency. This package is ecosystem tier: a minor release can carry a breaking change, so pin it with a tilde, `~1.4` (pin the minor, not `~1.x`, which npm expands to the same range as `^1`), rather than the default caret. See [Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md) for the full policy.

### Usage

Side-effect registration (automatic environment detection):

```js
import '@cancjs/unhandled-rejection/register';
```

Explicit programmatic registration:

```js
import { register } from '@cancjs/unhandled-rejection';

register();
```

Custom callback for unhandled non-cancellation errors:

```js
import { register } from '@cancjs/unhandled-rejection';

register({
  onUnhandledRejection(reason, promise) {
    logger.error('Unhandled promise rejection:', reason);
  },
});
```

## How It Works

`@cancjs/unhandled-rejection` selects an environment-appropriate strategy during registration. In Node.js, Bun, and Electron main processes, it hooks `process.on('unhandledRejection')`. If the rejection reason is a `CancelError`, the handler returns silently. If the rejection is a real application error, the handler either delegates to your `onUnhandledRejection` callback or re-throws the error to preserve the runtime's default crash behavior.

The re-throw is not identical to the Node.js default. Without an `onUnhandledRejection` callback the handler throws the rejection reason from inside the listener, so the process still crashes, but it crashes with an uncaught exception rather than an `ERR_UNHANDLED_REJECTION` error. It also overrides `--unhandled-rejections=warn`: a process started with that flag would normally log and continue, and with this handler installed it exits. Pass `onUnhandledRejection` if you need to keep the process alive.

In web browsers, Deno, Web Workers, Service Workers, and Cloudflare Workers, it attaches an `unhandledrejection` event listener to `globalThis`. When a `CancelError` is encountered, the listener calls `event.preventDefault()` to prevent default browser console reporting or script termination. Non-cancellation rejections are passed to your custom callback (with `preventDefault()`) or left alone to let default runtime behavior proceed.

## Description

### Cancellation and unhandled rejection

In `@cancjs/promise`, cancellation is represented as a promise rejection using `CancelError`. When an operation is canceled, any pending promise chain rejects. If a consumer drops a promise reference or cancels an operation without attaching a `.catch()` or `catchCancel()` handler, the runtime receives an unhandled rejection event.

Treating cancellation as rejection preserves standard `try`/`catch` control flow and async error propagation semantics. However, uncaught cancellation should not crash Node.js applications or pollute browser telemetry logs. `@cancjs/unhandled-rejection` provides global filtering to distinguish expected cancellation from actual runtime defects.

### Environment detection

The `register()` function automatically detects your runtime environment in the following order:

| Environment        | Detection Rule                | Registration Strategy                                 |
| ------------------ | ----------------------------- | ----------------------------------------------------- |
| Bun                | `globalThis.Bun`              | `process.on('unhandledRejection')`                    |
| Deno               | `globalThis.Deno`             | `globalThis.addEventListener('unhandledrejection')`   |
| Electron           | `process.versions.electron`   | `process.on()` plus the event listener when it exists |
| Node.js            | `process.versions.node`       | `process.on('unhandledRejection')`                    |
| Browsers / Workers | `globalThis.addEventListener` | `globalThis.addEventListener('unhandledrejection')`   |

Bun, Deno, and Electron are all checked before `process.versions.node`, because all three define it. Deno 2 runs Node.js compatibility by default, so a `process.versions.node` check alone would take Deno down the Node.js path, and which path it took would depend on the Deno version. Bun uses the Node.js process hook, and the registration is labeled bun so duplicate registration warnings name the real environment. Deno uses the event listener, which it supports in both 1.x and 2.x. An Electron renderer has a Node.js process and a DOM, and renderer rejections land on the DOM event, so both targets are hooked there. An Electron main process has no `addEventListener` and gets the process hook only. Specific registration functions (`registerNode()`, `registerBrowser()`, `registerDeno()`, `registerBun()`, `registerWorker()`, `registerElectron()`) are also exported for explicit control.

### Widening the suppression scope

By default, only `CancelError` instances are suppressed. You can widen the suppression scope to include `AbortError` or `TimeoutError` by passing optional boolean flags:

```ts
import { register } from '@cancjs/unhandled-rejection';

register({
  abort: true,
  timeout: true,
});
```

When `abort: true` is set, the handler silences raw `AbortError` instances as well as `CancelError` instances wrapping an abort (where `error.aborted === true`). When `timeout: true` is set, the handler silences raw `TimeoutError` instances as well as `CancelError` instances wrapping a timeout (where `error.timedOut === true`). This matches the predicate matching behavior of `catchCancel` and `suppressCancel` in `@cancjs/promise`. Enable these options if your application frequently aborts `fetch` requests or uses operation timeouts.

### Custom rejection handling

When passing `onUnhandledRejection`, your custom function receives `(reason, promise)` for all non-suppressed rejections. In Node.js, specifying a custom callback suppresses default process termination and forwards non-cancellation errors to your function. In browser environments, specifying a custom callback calls `preventDefault()` on the event and routes the error to your callback.

Your `onUnhandledRejection` callback must execute synchronously. Runtimes fire rejection events synchronously and ignore returned promises. If an asynchronous callback rejects, it creates a secondary unhandled rejection. Start async operations inside your callback and handle their errors explicitly:

```js
register({
  onUnhandledRejection(reason) {
    sendTelemetry(reason).catch(console.error);
  },
});
```

### Integration with error reporting services

When using error tracking SDKs like Sentry, Datadog, or Bugsnag, register `@cancjs/unhandled-rejection` before initializing your SDK. For example, with Sentry:

```js
import { register } from '@cancjs/unhandled-rejection';
import * as Sentry from '@sentry/node';

register();

Sentry.init({
  dsn: 'https://example@sentry.io/123',
  beforeSend(event, hint) {
    if (hint && hint.originalException && hint.originalException.name === 'CancelError') {
      return null;
    }
    return event;
  },
});
```

Registering `@cancjs/unhandled-rejection` first prevents Node.js process termination, while adding a `beforeSend` filter prevents `CancelError` events from generating unnecessary telemetry alerts.

### Integration with existing handlers

Event listeners for `unhandledrejection` and `process.on('unhandledRejection')` are additive. Attaching `@cancjs/unhandled-rejection` does not remove existing process listeners. If your application or a third-party framework registers a custom rejection listener, that listener will still receive `CancelError` objects unless it includes an explicit `isCancelError` check:

```js
import { isCancelError } from '@cancjs/promise';

process.on('unhandledRejection', (reason) => {
  if (isCancelError(reason)) {
    return;
  }
  customLogger.error(reason);
});
```

### Manual recipes

For library authors, custom test harnesses, or exotic runtimes where global package registration is not desired, use these manual recipes:

Node.js and Bun:

```js
import { isCancelError } from '@cancjs/promise';

process.on('unhandledRejection', (reason) => {
  if (!isCancelError(reason)) {
    throw reason;
  }
});
```

Node.js and Bun with abort and timeout widening:

```js
import { isCancelError, isAbortError, isTimeoutError } from '@cancjs/promise';

process.on('unhandledRejection', (reason) => {
  const isSuppressed =
    isCancelError(reason) ||
    isAbortError(reason) ||
    isTimeoutError(reason) ||
    (isCancelError(reason) && (reason.aborted || reason.timedOut));

  if (!isSuppressed) {
    throw reason;
  }
});
```

Browsers, Deno, and Web Workers:

```js
import { isCancelError } from '@cancjs/promise';

globalThis.addEventListener('unhandledrejection', (event) => {
  if (isCancelError(event.reason)) {
    event.preventDefault();
  }
});
```

Browsers, Deno, and Web Workers with abort and timeout widening:

```js
import { isCancelError, isAbortError, isTimeoutError } from '@cancjs/promise';

globalThis.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const isSuppressed =
    isCancelError(reason) ||
    isAbortError(reason) ||
    isTimeoutError(reason) ||
    (isCancelError(reason) && (reason.aborted || reason.timedOut));

  if (isSuppressed) {
    event.preventDefault();
  }
});
```

Custom logging pattern (Node.js):

```js
import { isCancelError } from '@cancjs/promise';

process.on('unhandledRejection', (reason) => {
  if (isCancelError(reason)) {
    return;
  }
  logger.error('Unhandled rejection:', reason);
});
```

Electron applications:

```js
// Call register() in main.js and renderer.js entry points
import { register } from '@cancjs/unhandled-rejection';

register();
```

### Warnings and diagnostics

`@cancjs/unhandled-rejection` logs diagnostic warnings to `console.warn` when duplicate registrations occur or when a process-specific handler is invoked in an incompatible environment.

Disable warnings globally at runtime:

```js
import { setWarn } from '@cancjs/unhandled-rejection';

setWarn(false);
```

Disable warnings per registration call:

```js
import { register } from '@cancjs/unhandled-rejection';

register({ warn: false });
```

Disable warnings using environment variables (Node.js/Bun):

```sh
CANC_UNHANDLED_WARN=0 node app.js
```

### Library authors

Libraries should not invoke `register()` or `@cancjs/unhandled-rejection/register`. Global rejection handling is an application-level concern. Library code should handle expected cancellation using `catchCancel` or `suppressCancel` from `@cancjs/promise` at internal flow boundaries.

## API

### Registration functions

- `register(options?: RegisterOptions): void`: Autodetects the host environment and installs the corresponding rejection handler.
- `registerNode(options?: RegisterOptions): void`: Installs a Node.js process listener. Logs a warning if `process.on` is unavailable.
- `registerBrowser(options?: RegisterOptions): void`: Installs a browser `globalThis` event listener. Logs a warning if `addEventListener` is unavailable.
- `registerDeno(options?: RegisterOptions): void`: Installs a Deno global event listener.
- `registerBun(options?: RegisterOptions): void`: Installs a Bun rejection handler through the Node.js process hook.
- `registerWorker(options?: RegisterOptions): void`: Installs a Web Worker / Service Worker event listener.
- `registerElectron(options?: RegisterOptions): void`: Installs the process listener and, in a renderer, the `globalThis` event listener as well. Outside Electron it falls back to `register()`.

### Lifecycle & Configuration

- `unregister(): void`: Removes all handlers registered by this package and resets registration tracking.
- `setWarn(enabled: boolean): void`: Globally enables or disables diagnostic warnings.

### Types

```ts
interface RegisterOptions {
  warn?: boolean;
  abort?: boolean;
  timeout?: boolean;
  onUnhandledRejection?: (reason: unknown, promise?: Promise<unknown>) => void;
}
```

## Runtime support

| Host Environment   | Default Behavior     | Unhandled Crash? | Supported Strategy                       |
| ------------------ | -------------------- | ---------------- | ---------------------------------------- |
| Node.js 15+        | Terminates process   | Yes              | `process.on('unhandledRejection')`       |
| Node.js 18+        | Terminates process   | Yes              | `process.on('unhandledRejection')`       |
| Bun                | Terminates process   | Yes              | `process.on('unhandledRejection')`       |
| Deno               | Terminates process   | Yes              | `addEventListener('unhandledrejection')` |
| Web Browsers       | Console error output | No               | `addEventListener('unhandledrejection')` |
| Web Workers        | Worker error event   | No               | `addEventListener('unhandledrejection')` |
| Service Workers    | Worker error event   | No               | `addEventListener('unhandledrejection')` |
| Cloudflare Workers | Request fail         | Yes              | `addEventListener('unhandledrejection')` |
| Electron Main      | Terminates process   | Yes              | `process.on('unhandledRejection')`       |
| Electron Renderer  | Console error output | No               | `addEventListener('unhandledrejection')` |

All listed environments are supported. Standard web runtimes are autodetected automatically when calling `register()`.

## Compatibility

Node.js 18 and later, Deno 1.0 and later, Bun 1.0 and later, modern browsers, TypeScript 4.2 and later. Requires `@cancjs/promise >=1.0.0` as a peer dependency. Everything else follows [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

## Documentation

- [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for core cancellation semantics and `CancelError`
- [`docs/unhandled-rejection.md`](https://github.com/cancjs/canc/blob/master/docs/unhandled-rejection.md) for full integration patterns and edge-case handling
- [Root README](https://github.com/cancjs/canc/blob/master/README.md) for monorepo overview
- [Examples](https://github.com/cancjs/canc/tree/master/examples) for application integration samples

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](./LICENSE)
