# Unhandled Rejection Reference Guide

This document provides a deep-dive companion to `@cancjs/unhandled-rejection` and the main README regarding promise cancellation rejections, runtime edge cases, async handlers, integration patterns, and UI framework boundaries.

## Why Unhandled Rejection Matters

In `canc`, cancellation is intentionally surfaced as a rejection containing `CancelError`. This design preserves standard `try/catch` and `.catch()` control flow. Because `CancelError` is an ordinary rejection, an unhandled canceled promise triggers an `unhandledRejection` event in JavaScript runtimes.

In modern runtimes such as Node.js 15+, unhandled rejections cause the process to terminate with a non-zero exit code. Registering `@cancjs/unhandled-rejection` prevents expected cancellation events from crashing your application while ensuring real errors continue to bubble or execute custom logging callbacks.

## Runtime Edge Cases

### Detection Order

The `register()` function determines the runtime environment by checking signals in order: electron detection (orthogonal check), then the `navigator.userAgent` string (the WinterCG convention), then the `EdgeRuntime` global (when present), then the fallback chain using `globalThis` properties and `process.versions`.

**First signal: Electron.** Checked via `process.versions.electron`. Electron is orthogonal: a renderer process has both a Node.js process and a DOM, so both rejection mechanisms are hooked there. Main process gets only the process hook.

**Primary signal: Runtime token from navigator.userAgent.** On Node.js 21+, Deno 2+, Bun, and Cloudflare Workers, `navigator.userAgent` contains a runtime-identifying string: `Node.js/22`, `Deno/1.40.0`, `Bun/1.0.28`, or `Cloudflare-Workers`. When a recognized token is present, it routes directly to the corresponding handler. Unrecognized or browser-shaped strings (like `Mozilla/5.0 (...) jsdom/20.0.0`) return no signal and fall through to the next check.

**Edge Runtime global.** Vercel Edge Runtime and other runtimes exposing the `EdgeRuntime` global are detected here. This check sits between standardized signals (userAgent tokens) and the legacy fallback chain.

**Fallback chain: Globals and process.versions.** For Node.js 18 and 20 (which have no `navigator`), or when earlier checks provide no signal, the package checks `globalThis.Bun`, `globalThis.Deno`, `process.versions.node`, and other global properties to pick the handler. This chain preserves behavior for legacy environments and acts as a safety net when the navigator is absent or unreadable.

**Why the fallback order matters.** Bun, Deno, and Electron all define `process.versions.node`, so checking for them explicitly before a bare `process.versions.node` check is necessary to avoid misrouting. In Deno 2, Node.js compatibility is enabled by default, so a `process.versions.node` check alone would send Deno down the Node.js path. Bun uses the Node.js process hook for unhandled rejections, and the registration is labeled `bun` so duplicate-registration warnings name the real environment. Deno uses the event listener instead, which it supports in both 1.x and 2.x. An Electron renderer has both a Node.js process and a DOM, so both handlers are attached. A main process has no DOM listener API and gets only the process hook. Explicit registration functions are also exported, so users can pick the exact handler they need if autodetection is not desired.

**Residual case.** A runtime with no navigator and no distinguishing global still falls through to a warn-path fallback handler. This is intentional, not a guess. It ensures the package does not crash in unknown JavaScript environments.

### Electron Dual-Context Architecture

Electron apps run in two distinct execution environments:

- **Main Process**: Full Node.js environment. Errors emit on `process.on('unhandledRejection')`.
- **Renderer Process**: Browser window environment. When `nodeIntegration` is enabled, both Node and browser APIs exist.

Calling `register()` inside both main and renderer entry points automatically selects the correct target handler for each context.

### Environment Detection and JSDOM

In headless test environments like `jsdom`, the runtime populates `navigator.userAgent` with a browser-shaped string (`Mozilla/5.0 (...) jsdom/20.0.0`), while `process.versions.node` is also populated. The detection logic treats a browser-shaped string as "no signal" and falls through to the process.versions check, correctly routing to the Node.js handler instead of the browser handler.

This prevents false-positive browser detection in test suites and ensures cancellation rejections are suppressed through the same mechanism as in production Node.js.

### Bundler Polyfills

Bundlers such as Webpack, Vite, or Rollup may define a stubbed `process` object in browser builds. The package verifies `process.versions.node` to ensure dummy `process` objects are not mistaken for a native Node.js environment.

### Edge and Worker Runtimes

Cloudflare Workers is recognized by the `Cloudflare-Workers` navigator token and registers as `worker`. Netlify Edge Functions run on Deno Deploy infrastructure and arrive with a `Deno/x.y.z` userAgent, so they are routed through the deno branch with the correct mechanism. Every other edge runtime without a recognized userAgent token falls through to the global/`process.versions` chain.

**Vercel Edge.** Vercel's Edge Runtime exposes the `EdgeRuntime` global. This package detects the presence of this global and registers via `registerEdgeRuntime()`, labeled `edge-runtime`. The detection branch sits between the standardized userAgent signals and the legacy fallback chain. Explicit registration is available for runtimes where autodetection is not desired.

**Worker label ambiguity.** The label `worker` names both the autodetected Cloudflare Workers registration (via the `Cloudflare-Workers` userAgent token) and the explicit `registerWorker()` export for Web Workers and Service Workers. Web and Service Workers lack a recognized userAgent token and are identified through fallback global checks. Cloudflare also gets the same label through autodetection. The single label is accepted as-is.

**Other edge runtimes.** Runtimes without a recognized userAgent token and no explicitly exported registrar fall through to the global/`process.versions` chain. If they have a global `addEventListener`, they register as `browser`. This preserves behavior for unknown JavaScript environments.

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
