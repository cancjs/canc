# Unhandled Rejection Reference Guide

This document provides a deep-dive companion to `@cancjs/unhandled-rejection` and the main README regarding promise cancellation rejections, runtime edge cases, async handlers, integration patterns, and UI framework boundaries.

## Why Unhandled Rejection Matters

In `canc`, cancellation is intentionally surfaced as a rejection containing `CancelError`. This design preserves standard `try/catch` and `.catch()` control flow. Because `CancelError` is an ordinary rejection, an unhandled canceled promise triggers an `unhandledRejection` event in JavaScript runtimes.

In modern runtimes such as Node.js 15+, unhandled rejections cause the process to terminate with a non-zero exit code. Registering `@cancjs/unhandled-rejection` prevents expected cancellation events from crashing your application while ensuring real errors continue to bubble or execute custom logging callbacks.

## Runtime Edge Cases

### Environment Detection and JSDOM

The automatic `register()` function checks for Node.js environment signatures before inspecting browser globals:

```ts
typeof process !== 'undefined' && process.versions?.node
```

This sequence prevents false-positive browser detection in headless test environments like `jsdom`, where `window.addEventListener` exists alongside Node.js process APIs.

### Electron Dual-Context Architecture

Electron apps run in two distinct execution environments:

- **Main Process**: Full Node.js environment. Errors emit on `process.on('unhandledRejection')`.
- **Renderer Process**: Browser window environment. When `nodeIntegration` is enabled, both Node and browser APIs exist.

Calling `register()` inside both main and renderer entry points automatically selects the correct target handler for each context.

### Bundler Polyfills

Bundlers such as Webpack, Vite, or Rollup may define a stubbed `process` object in browser builds. The package verifies `process.versions.node` to ensure dummy `process` objects are not mistaken for a native Node.js environment.

### Bun Test Strict Rejections

`bun test` treats any unhandled rejection as an immediate test failure. Importing `@cancjs/unhandled-rejection/register` in your test setup file prevents canceled test operations from failing the test suite.

## Async Handler Requirement

All JavaScript runtime rejection listeners execute synchronously. Return values from listeners are ignored by the runtime.

```ts
// Avoid: async handlers can create secondary unhandled rejections
register({
  onUnhandledRejection: async (reason) => {
    await sendRemoteLog(reason); // Errors here are unhandled!
  }
});

// Recommended: synchronous handler starting background tasks with error guards
register({
  onUnhandledRejection: (reason) => {
    sendRemoteLog(reason).catch((err) => {
      console.error('Failed to report unhandled rejection:', err);
    });
  }
});
```

If an async listener throws an error or returns a rejected promise, that rejection will trigger a second `unhandledRejection` event, potentially causing infinite loops.

## Common Integration Patterns

### Error Reporting Services (Sentry, Bugsnag, Datadog)

When integrating third-party monitoring tools, install `@cancjs/unhandled-rejection` at application startup before initializing the error SDK:

```ts
import { register } from '@cancjs/unhandled-rejection';
import { isCancelError } from '@cancjs/promise';
import * as Sentry from '@sentry/node';

register();

Sentry.init({
  dsn: 'https://example@sentry.io/123',
  beforeSend(event, hint) {
    if (isCancelError(hint.originalException)) {
      return null;
    }
    return event;
  }
});
```

### Graceful Shutdown

For server applications requiring graceful teardown on unexpected crashes:

```ts
import { register } from '@cancjs/unhandled-rejection';

register({
  onUnhandledRejection: (reason) => {
    console.error('Fatal unhandled rejection:', reason);
    server.close(() => process.exit(1));
  }
});
```

### Jest Test Setup

To install global suppression across Jest test suites, add `@cancjs/unhandled-rejection/register` to `setupFiles` in your `jest.config.js`:

```js
module.exports = {
  setupFiles: ['@cancjs/unhandled-rejection/register']
};
```

## Framework Error Boundaries

UI framework error boundaries (such as React Error Boundaries or Vue `onErrorCaptured`) capture errors thrown during render phase, lifecycle methods, and component trees. They do **not** capture asynchronous promise rejections.

Global rejection suppression through `@cancjs/unhandled-rejection` operates at the runtime event loop layer and complements framework error boundaries.
