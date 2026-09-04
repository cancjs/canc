<div align="center">
  <img src="https://raw.githubusercontent.com/cancjs/canc/master/assets/canc-logo.svg" style="width: 400px; max-width: 100%; height: auto;" title="canc &#x2BBF; A crafty foundation for cancelable promises" alt="canc &#x2BBF; A crafty foundation for cancelable promises">
  <div>&nbsp;</div>
</div>

<h1 align="center">@cancjs/node</h1>

<p align="center">
Node built-in modules with cancelable promises and typed failures.
</p>

---

## Introduction

`@cancjs/node` provides cancelable promise wrappers and typed failure channels for Node.js built-in modules. To migrate, replace built-in imports like `node:fs/promises` or `node:child_process` with `@cancjs/node/<module>` (such as `@cancjs/node/fs` or `@cancjs/node/child-process`). All wrapped functions return `CancelablePromise` instances and propagate cancellations cleanly.

The package ships the `fs`, `fs/sync`, and `fs/register-graceful` subpaths. Additional module wrappers are under active development and scheduled for upcoming releases. The root entry `@cancjs/node` provides shared error classes, errno predicates, and runtime feature detection used across all subpaths.

## Features

- drop-in replacement for Node.js promise-based built-in modules
- returns `CancelablePromise` with cancellation and abort propagation
- typed failure channels and portable error code guards
- runtime feature detection for version-gated capabilities
- zero-overhead passthrough when features are natively supported

## Getting Started

### Installation

```sh
npm install @cancjs/node @cancjs/promise
```

`@cancjs/promise` is a peer dependency. This package is ecosystem tier: a minor release can carry a breaking change, so pin it with a tilde, `~1.4` (pin the minor, not `~1.x`, which npm expands to the same range as `^1`), rather than the default caret. See [Versioning](https://github.com/cancjs/canc/blob/master/docs/versioning.md) for the full policy.

### Usage

```ts
import { features, isNotFoundError } from "@cancjs/node";

if (features.hasGlob) {
  // Glob feature is available in the current runtime environment
}

try {
  // Application logic
} catch (error) {
  if (isNotFoundError(error)) {
    // Handle ENOENT
  }
}
```

## How It Works

The root entry point exposes portable error code guards and custom error classes used across all `@cancjs/node` subpaths. Syscall error guards verify standard error codes without relying on non-portable numeric errno values or fragile instanceof checks.

Feature detection probes capability support at module load time, without inspecting vendor-specific globals. Some Node facts are finer than a release line, so the version the runtime reports settles those, and the capability probes are the fallback for a runtime that reports no version.

## Description

### Subpath support

For operations marked "stops waiting only", cancellation stops waiting for completion while the underlying runtime operation continues in the background.

Cancellation never undoes work that already happened. A canceled `copyFile` leaves whatever was already written to the destination, the same as an interrupted copy does, and it never deletes a path you did not ask to delete.

<!-- generated:start -->

#### child-process

| Export     | Cancellation       | Node | Deno | Bun     |
| ---------- | ------------------ | ---- | ---- | ------- |
| `exec`     | stops waiting only | 18+  | ✅   | ✅      |
| `execFile` | stops waiting only | 18+  | ✅   | ✅      |
| `spawn`    | stops the work     | 18+  | ✅   | partial |
| `fork`     | stops the work     | 18+  | ✅   | partial |

#### fs

| Export              | Cancellation       | Node | Deno | Bun |
| ------------------- | ------------------ | ---- | ---- | --- |
| `access`            | before it starts   | 18+  | ✅   | ✅  |
| `appendFile`        | stops the work     | 18+  | ✅   | ✅  |
| `chmod`             | before it starts   | 18+  | ✅   | ✅  |
| `chown`             | before it starts   | 18+  | ✅   | ✅  |
| `copyFile`          | stops waiting only | 18+  | ✅   | ✅  |
| `cp`                | stops waiting only | 18+  | ✅   | ✅  |
| `glob`              | -                  | 22+  | ✅   | ✅  |
| `lchmod`            | before it starts   | 18+  | ✅   | ✅  |
| `lchown`            | before it starts   | 18+  | ✅   | ✅  |
| `link`              | before it starts   | 18+  | ✅   | ✅  |
| `lstat`             | before it starts   | 18+  | ✅   | ✅  |
| `lutimes`           | before it starts   | 18+  | ✅   | ✅  |
| `mkdir`             | before it starts   | 18+  | ✅   | ✅  |
| `mkdtemp`           | before it starts   | 18+  | ✅   | ✅  |
| `mkdtempDisposable` | before it starts   | 24+  | ✅   | ✖   |
| `open`              | stops the work     | 18+  | ✅   | ✅  |
| `opendir`           | stops the work     | 18+  | 🚧   | ✅  |
| `readFile`          | stops the work     | 18+  | ✅   | ✅  |
| `readdir`           | before it starts   | 18+  | ✅   | ✅  |
| `readlink`          | before it starts   | 18+  | ✅   | ✅  |
| `realpath`          | before it starts   | 18+  | ✅   | ✅  |
| `rename`            | before it starts   | 18+  | ✅   | ✅  |
| `rm`                | stops waiting only | 18+  | ✅   | ✅  |
| `rmdir`             | before it starts   | 18+  | ✅   | ✅  |
| `stat`              | before it starts   | 18+  | ✅   | ✅  |
| `statfs`            | before it starts   | 18+  | ✅   | ✅  |
| `symlink`           | before it starts   | 18+  | ✅   | ✅  |
| `truncate`          | before it starts   | 18+  | ✅   | ✅  |
| `unlink`            | before it starts   | 18+  | ✅   | ✅  |
| `utimes`            | before it starts   | 18+  | ✅   | ✅  |
| `watch`             | -                  | 18+  | ✅   | ✅  |
| `writeFile`         | stops the work     | 18+  | ✅   | ✅  |

#### fs/extra

| Export              | Cancellation     | Node | Deno | Bun |
| ------------------- | ---------------- | ---- | ---- | --- |
| `copy`              | stops the work   | 18+  | ✅   | ✅  |
| `emptyDir`          | stops the work   | 18+  | ✅   | ✅  |
| `emptyDirSync`      | -                | 18+  | ✅   | ✅  |
| `ensureDir`         | before it starts | 18+  | ✅   | ✅  |
| `ensureDirSync`     | -                | 18+  | ✅   | ✅  |
| `ensureFile`        | before it starts | 18+  | ✅   | ✅  |
| `ensureFileSync`    | -                | 18+  | ✅   | ✅  |
| `ensureLink`        | before it starts | 18+  | ✅   | ✅  |
| `ensureLinkSync`    | -                | 18+  | ✅   | ✅  |
| `ensureSymlink`     | before it starts | 18+  | ✅   | ✅  |
| `ensureSymlinkSync` | -                | 18+  | ✅   | ✅  |
| `mkdirp`            | before it starts | 18+  | ✅   | ✅  |
| `mkdirpSync`        | -                | 18+  | ✅   | ✅  |
| `mkdirs`            | before it starts | 18+  | ✅   | ✅  |
| `mkdirsSync`        | -                | 18+  | ✅   | ✅  |
| `move`              | stops the work   | 18+  | ✅   | ✅  |
| `moveSync`          | -                | 18+  | ✅   | ✅  |
| `outputFile`        | stops the work   | 18+  | ✅   | ✅  |
| `outputFileSync`    | -                | 18+  | ✅   | ✅  |
| `outputJson`        | stops the work   | 18+  | ✅   | ✅  |
| `outputJsonSync`    | -                | 18+  | ✅   | ✅  |
| `pathExists`        | before it starts | 18+  | ✅   | ✅  |
| `readJson`          | stops the work   | 18+  | ✅   | ✅  |
| `readJsonSync`      | -                | 18+  | ✅   | ✅  |
| `replaceFile`       | stops the work   | 18+  | ✅   | ✅  |
| `replaceFileSync`   | -                | 18+  | ✅   | ✅  |
| `walk`              | -                | 18+  | ✅   | ✅  |
| `walkSync`          | -                | 18+  | ✅   | ✅  |
| `writeJson`         | stops the work   | 18+  | ✅   | ✅  |
| `writeJsonSync`     | -                | 18+  | ✅   | ✅  |

#### FileHandle (fs)

| Export                  | Cancellation       | Node | Deno | Bun |
| ----------------------- | ------------------ | ---- | ---- | --- |
| `[Symbol.asyncDispose]` | -                  | 18+  | ✅   | ✅  |
| `appendFile`            | stops the work     | 18+  | ✅   | ✅  |
| `chmod`                 | before it starts   | 18+  | ✅   | ✅  |
| `chown`                 | before it starts   | 18+  | ✅   | ✅  |
| `close`                 | before it starts   | 18+  | ✅   | ✅  |
| `createReadStream`      | -                  | 18+  | ✅   | ✅  |
| `createWriteStream`     | -                  | 18+  | ✅   | ✅  |
| `datasync`              | before it starts   | 18+  | ✅   | ✅  |
| `pull`                  | -                  | 24+  | ✖    | ✖   |
| `read`                  | stops waiting only | 18+  | ✅   | ✅  |
| `readableWebStream`     | -                  | 18+  | ✅   | ✅  |
| `readFile`              | stops the work     | 18+  | ✅   | ✅  |
| `readLines`             | -                  | 18+  | ✅   | ✅  |
| `readv`                 | stops waiting only | 18+  | ✅   | ✅  |
| `stat`                  | before it starts   | 18+  | ✅   | ✅  |
| `sync`                  | before it starts   | 18+  | ✅   | ✅  |
| `truncate`              | before it starts   | 18+  | ✅   | ✅  |
| `utimes`                | before it starts   | 18+  | ✅   | ✅  |
| `write`                 | stops waiting only | 18+  | ✅   | ✅  |
| `writeFile`             | stops the work     | 18+  | ✅   | ✅  |
| `writer`                | -                  | 26+  | ✖    | ✖   |
| `writev`                | stops waiting only | 18+  | ✅   | ✅  |

#### readline

| Export                 | Cancellation | Node | Deno | Bun |
| ---------------------- | ------------ | ---- | ---- | --- |
| `InterfaceConstructor` | -            | 18+  | n/a  | n/a |
| `createInterface`      | -            | 18+  | ✅   | ✅  |
| `emitKeypressEvents`   | -            | 18+  | n/a  | n/a |

#### InterfaceConstructor (readline)

| Export                   | Cancellation | Node | Deno       | Bun        |
| ------------------------ | ------------ | ---- | ---------- | ---------- |
| `[Symbol.asyncIterator]` | -            | 18+  | unverified | unverified |
| `[Symbol.dispose]`       | -            | 22+  | unverified | unverified |
| `close`                  | -            | 18+  | unverified | unverified |
| `cursor`                 | -            | 18+  | unverified | unverified |
| `getCursorPos`           | -            | 18+  | unverified | unverified |
| `getPrompt`              | -            | 18+  | unverified | unverified |
| `line`                   | -            | 18+  | unverified | unverified |
| `pause`                  | -            | 18+  | unverified | unverified |
| `prompt`                 | -            | 18+  | unverified | unverified |
| `resume`                 | -            | 18+  | unverified | unverified |
| `setPrompt`              | -            | 18+  | unverified | unverified |
| `write`                  | -            | 18+  | unverified | unverified |

#### readlinePromises (readline)

| Export      | Cancellation | Node | Deno | Bun |
| ----------- | ------------ | ---- | ---- | --- |
| `Interface` | -            | 18+  | ✅   | ✅  |
| `Readline`  | -            | 18+  | ✅   | ✅  |

#### readlinePromises.Interface (readline)

| Export     | Cancellation   | Node | Deno       | Bun        |
| ---------- | -------------- | ---- | ---------- | ---------- |
| `question` | stops the work | 18+  | unverified | unverified |

#### readlinePromises.Readline (readline)

| Export            | Cancellation | Node | Deno       | Bun        |
| ----------------- | ------------ | ---- | ---------- | ---------- |
| `clearLine`       | -            | 18+  | unverified | unverified |
| `clearScreenDown` | -            | 18+  | unverified | unverified |
| `commit`          | -            | 18+  | unverified | unverified |
| `cursorTo`        | -            | 18+  | unverified | unverified |
| `moveCursor`      | -            | 18+  | unverified | unverified |
| `rollback`        | -            | 18+  | unverified | unverified |

<!-- generated:end -->

`walk` and `walkSync` are iterables stopped with `break` or `return()` rather than `.cancel()`, so their cancellation cell reads `-`.

### Shipped subpaths

The package currently ships eleven subpaths:

- `fs`: file system operations with cancelable promises
- `fs/sync`: synchronous file system utilities
- `fs/register-graceful`: automatic graceful-fs integration hook
- `child-process`: external commands and spawned processes with cancellation support
- `timers`: cancelable timer promises
- `stream`: stream consumers, pipeline helpers and readable terminals
- `events`: event listener helpers and cancelable event promises
- `dns`: cancelable DNS resolution
- `readline`: cancelable line-by-line reading
- `crypto`: cancelable cryptographic operations
- `zlib`: cancelable compression utilities

The `/fs/sync` subpath drops `realpathSync.native`, which is the only departure from Node's own synchronous file system signatures.

```ts
import { readFile } from "@cancjs/node/fs";
import { readFileSync } from "@cancjs/node/fs/sync";

const data = await readFile("package.json", "utf8");
const syncData = readFileSync("package.json", "utf8");
```

### File system registry

Custom file system implementations such as `graceful-fs` or mock instances can be registered globally using `setFs`, `getFs`, and `resetFs`.

- `setFs(impl: IFsLike, options?: ISetFsOptions)`: registers an implementation for callback and synchronous operations.
- `getFs()`: returns the currently registered file system implementation.
- `resetFs()`: resets the registered file system back to default `node:fs`.
- `retryOpen(operation, options?)`: retries open and opendir operations on `EMFILE` and `ENFILE` descriptor errors when `retryOpen` is enabled.

When `retryOpen: true` is configured in `ISetFsOptions`, calls to `open` and `opendir` automatically retry with exponential backoff on descriptor exhaustion errors.

To configure `graceful-fs` with descriptor retry automatically, import the side-effect subpath:

````ts
import "@cancjs/node/fs/register-graceful";

### child-process

Import from `@cancjs/node/child-process` to run external commands with cancellation support. Every function returns the same `ChildProcess` node returns, with one property added:

```ts
import { spawn } from "@cancjs/node/child-process";

const child = spawn("npm", ["test"]);

// node's own API, unchanged
child.stdout.pipe(process.stdout);
console.log("Process PID:", child.pid);

// the promise is ours
const result = await child.promise;
````

The `promise` property is built on first access and reused after that. The promise can be taken at any time; the terminal outcome is recorded when it happens and replayed to a late reader (`exec` and `execFile` have always behaved this way through node's callback). Nothing else about the child is wrapped, so the callback form, the streams, async iteration over `child.stdout` and the option bag all keep node's behavior. Because listeners are attached eagerly to record terminal events, `child.listenerCount` differs from plain node.

#### What the promise settles with

`exec` and `execFile` mirror node's own promisified form. The promise resolves with `stdout` and `stderr`, and passes node's error through with `stdout` and `stderr` attached on failure.

`spawn` and `fork` have no promise form in node to mirror. Their promise resolves `{ exitCode: 0, signal: null }` on a clean exit and rejects `ProcessExitError` otherwise, carrying whichever of `exitCode` and `signal` node reported. `child.on("close")` still reports the same outcome without throwing.

One failure that node reports ambiguously gets a typed error: `ProcessSpawnError` when the process could not start. `ProcessExitError` is what `spawn` and `fork` reject with when they exit non-zero or are killed by a signal.

#### Cancellation

Canceling sends `killSignal`, defaulting to `SIGTERM`, which is what node's own `signal` option sends on abort. Awaiting `cancel()` waits for the child to exit, under an upper bound of 5 seconds (5000ms) so that a cancel cannot hang. There is no escalation and no process tree handling. A child that ignores `SIGTERM` keeps running, and the caller decides what to do about it.

For `exec`, `execFile` when given a shell option, and `spawn` with `{ shell: true }`, the promise rejecting does not mean the command stopped. The process being signaled is the shell the function inserted, not the command. `spawn` and `fork` without a shell are unaffected. A caller who needs the command itself stopped should run without a shell, or have the command handle its own termination.

```ts
const child = spawn("npm", ["test"]);
await child.promise.cancel();
```

Node options are forwarded untouched, `timeout` and `killSignal` included, so `exec(command, { timeout: 10000 })` terminates through node exactly as it does without this package. An `AbortSignal` passed as `signal` also reaches node untouched, which means an abort produces node's `AbortError` rather than a `CancelError`. To get canc semantics on a deadline, compose instead:

```ts
import { exec } from "@cancjs/node/child-process";
import { timeout } from "@cancjs/toolbox";

// deadlines produce a CancelError marked as timed out
const result = await timeout(exec("long-running-command").promise, 10000);
```

### timers

`setTimeout`, `setImmediate`, `setInterval`, `scheduler.wait` and `scheduler.yield` are exported
for drop-in symmetry with `node:timers/promises`, plus a `ref` option that lets a pending timer
skip holding the event loop open. For most call sites, `delay` and `timeout` from
`@cancjs/toolbox` are the idiomatic choice: they already return cancelable promises and compose
with the rest of canc without an extra import. Reach for this subpath when porting code that
already calls `node:timers/promises` directly, or when `ref: false` is needed.

`setInterval` returns an async iterable rather than a promise. Cancel it by calling `cancel()` on
the returned iterator, or by breaking a `for await` loop over it; both end iteration and clear the
underlying timer. `scheduler.yield` takes no options and is node's own function, unwrapped.

### stream

`pipeline` and `finished` wrap `node:stream/promises`, alongside the stream classes,
`addAbortSignal`, `Readable.from`, `Duplex.from` and `duplexPair`, re-exported structurally so a
caller does not need a second import to use the wrappers. Canceling `pipeline` destroys every
stream in the chain, the same teardown node runs for its own aborted pipeline. Canceling `finished`
removes the listeners it attached.

`text`, `json`, `buffer`, `arrayBuffer`, `blob` and `bytes` wrap `node:stream/consumers`. None of
these take a signal from node, so canceling destroys the source stream directly; pass
`{ destroyOnCancel: false }` when the stream is shared with another reader. `bytes` is
feature-gated and throws `NotImplementedError` on a runtime that lacks it.

`toArray`, `reduce`, `some`, `every`, `find` and `forEach` wrap the promise-returning `Readable`
terminals. They are free functions taking the stream as their first argument, `toArray(stream)`,
not a `Readable.prototype` patch, so `stream.toArray()` is not this package's API. The lazy
helpers `map`, `filter`, `take`, `drop` and `flatMap` return a stream rather than a promise and are
not wrapped here; `@cancjs/toolbox/async-iter` owns that shape.

### events

`once` and `on` wrap `node:events`, alongside `addAbortListener` (polyfilled below Node 18.18) and
`EventEmitter`, re-exported structurally. Both already accept an `AbortSignal`; what this subpath
adds on top is consumer counting, which no controller gives you on its own. Canceling one consumer
of a shared `once` call leaves the listener in place for whoever else is still waiting, and only
removes it once every consumer has given up:

```ts
import { once } from "@cancjs/node/events";

const ready = once(emitter, "ready");
const a = ready.then(([value]) => value);
const b = ready.then(([value]) => value + 1);

a.cancel();
// emitter.listenerCount("ready") is still 1: b is still waiting.

emitter.emit("ready", 41);
// a rejects CancelError, b resolves 42.
```

### dns

Canceling a module-level lookup such as `resolve4` only stops waiting for the result. Node gives no way to interrupt the query itself, so it keeps running in the background and the answer is discarded when it arrives.

A `Resolver` instance is different: canceling one of its queries is real, but the underlying cancel is scoped to the whole resolver, not the single query. It stops every query currently in flight on that resolver, not just the one that was canceled.

`resolveTlsa` needs Node 22 or later and is not available on Deno or Bun.

### readline

`question` answers a cancelable promise. Canceling it aborts the pending prompt through node's own `signal` handling and restores the interface to the state it was in before the call, including stdin's raw mode. A canceled question never consumes the next line typed at the prompt.

### crypto

Every promisified function in this subpath runs on Node's libuv threadpool, and node gives no way to preempt that work once it has started. Canceling stops waiting: the returned promise rejects with `CancelError`, but the call keeps running to completion in the background, and the threadpool slot it holds stays occupied until it finishes. With the default pool of four slots, a canceled `scrypt` or `argon2` call can delay unrelated `fs` and `dns` operations that are queued behind it. Bound the cost up front (smaller iteration counts, smaller inputs) rather than relying on cancellation to free resources.

The synchronous factory surface (`createHash`, `createCipheriv`, `randomUUID`, `webcrypto`, `constants`, and everything else that never had a callback form) passes through unchanged, so building a cipher or a hash does not need a second import.

`argon2`, `encapsulate`, and `decapsulate` need Node 24 or later and throw `NotImplementedError` on older runtimes.

### zlib

This subpath ships three different cancellation shapes, and they are not interchangeable:

- One-shot buffer functions (`gzip`, `deflate`, `brotliCompress`, the zstd family, and their decompressing counterparts) run on the threadpool exactly like the crypto functions above. Canceling only stops waiting; the compression or decompression keeps running, and the threadpool slot stays occupied until it finishes, which can delay unrelated `fs` and `dns` work the same way.
- Stream factories (`createGzip`, `createBrotliCompress`, the zstd stream classes, and the rest of the re-exported factory surface) are genuinely stoppable: calling `destroy()` on the returned stream stops the underlying codec.
- The iterable codec family (`compressGzip`, `decompressBrotli`, and their six siblings, Node 24+) cancels between chunks: it stops pulling from the source iterable and calls the source iterator's own `return()`, so nothing further reaches the codec after that point.
- `zipFiles` (Node 26+) checkpoints per file: canceling mid-list stops opening any further entry at the next file boundary, keeps every entry already written, and never rolls an entry back.

The zstd family, the iterable codec family, and the zip archive family are all version-gated and throw `NotImplementedError` on a runtime that does not ship them.

### Planned subpaths

Wrapped built-in modules are arriving in upcoming releases. Planned subpaths include:

- `fs/extra`: extended file system helper routines
- `net`: networking helpers
- `tls`: TLS socket utilities
- `http`: HTTP, HTTPS, and HTTP/2 clients and servers
- `worker-threads`: worker thread coordination
- `dgram`: UDP socket helpers

## File system

The `@cancjs/node` package provides cancelable promise-based wrappers and extended utilities across four file system subpaths:

- `@cancjs/node/fs`: cancelable promise-based equivalents for Node.js `node:fs/promises` built-in methods.
- `@cancjs/node/fs/sync`: synchronous file system methods routing through the registered file system implementation.
- `@cancjs/node/fs/extra`: extended file system helpers with per-entry cancellation checkpoints.
- `@cancjs/node/fs/register-graceful`: side-effect import registering `graceful-fs` with automatic retry on handle operations.

### Cancellation and partial state

For multi-step operations (`copy`, `move` across devices, `emptyDir`, `walk`), cancellation checkpoints occur between entries. When canceled mid-operation:

- the operation halts before processing the next entry;
- partial state created up to that checkpoint remains on disk;
- no rollback is attempted to prevent data loss races;
- `replaceFile` provides atomic single-file replacement using a temporary file and rename;
- `copy` accepts `{ onProgress }` to track written paths.

`/fs/extra` helpers are cancel-only and do not accept a caller `signal`; `/fs` does.

### Migration from fs-extra

| fs-extra method                               | @cancjs/node equivalent                       | Differences and notes                                                                                                                                                                                                                                                                                        |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `copy`                                        | `copy` (`@cancjs/node/fs/extra`)              | Checkpoints between entries. The `filter` option evaluates the source entry only. The `overwrite` option defaults to `true`; with `overwrite: false` it skips existing files, and with `errorOnExist: true` it rejects `EEXIST`. Distinct from `cp` in `@cancjs/node/fs` which delegates to runtime `fs.cp`. |
| `copySync`                                    | -                                             | Use `cpSync` from `@cancjs/node/fs/sync` or async `copy`.                                                                                                                                                                                                                                                    |
| `emptyDir`                                    | `emptyDir` (`@cancjs/node/fs/extra`)          | Removes directory contents while keeping the directory itself.                                                                                                                                                                                                                                               |
| `emptyDirSync`                                | `emptyDirSync` (`@cancjs/node/fs/extra`)      | Synchronous twin.                                                                                                                                                                                                                                                                                            |
| `ensureDir` / `mkdirs` / `mkdirp`             | `ensureDir` (`@cancjs/node/fs/extra`)         | Recursively creates directory, ignoring `EEXIST`. `mkdirs` and `mkdirp` are deprecated aliases.                                                                                                                                                                                                              |
| `ensureDirSync` / `mkdirsSync` / `mkdirpSync` | `ensureDirSync` (`@cancjs/node/fs/extra`)     | Synchronous twin. `mkdirsSync` and `mkdirpSync` are deprecated aliases.                                                                                                                                                                                                                                      |
| `ensureFile`                                  | `ensureFile` (`@cancjs/node/fs/extra`)        | Creates file and any missing parent directories. Rejects `EISDIR` if path is an existing directory.                                                                                                                                                                                                          |
| `ensureFileSync`                              | `ensureFileSync` (`@cancjs/node/fs/extra`)    | Synchronous twin.                                                                                                                                                                                                                                                                                            |
| `ensureLink`                                  | `ensureLink` (`@cancjs/node/fs/extra`)        | Creates hard link and missing parent directories.                                                                                                                                                                                                                                                            |
| `ensureLinkSync`                              | `ensureLinkSync` (`@cancjs/node/fs/extra`)    | Synchronous twin.                                                                                                                                                                                                                                                                                            |
| `ensureSymlink`                               | `ensureSymlink` (`@cancjs/node/fs/extra`)     | Creates symbolic link and missing parent directories.                                                                                                                                                                                                                                                        |
| `ensureSymlinkSync`                           | `ensureSymlinkSync` (`@cancjs/node/fs/extra`) | Synchronous twin.                                                                                                                                                                                                                                                                                            |
| `move`                                        | `move` (`@cancjs/node/fs/extra`)              | Atomic `rename` on same device; falls back to copy then remove on `EXDEV`. Source is removed only after copy completes. `overwrite` defaults to `true`; does not remove a non-empty destination first, surfacing `ENOTEMPTY` or `EPERM`. `overwrite: false` rejects `EEXIST` matching fs-extra.              |
| `moveSync`                                    | `moveSync` (`@cancjs/node/fs/extra`)          | Synchronous twin. Does not retry a busy rename.                                                                                                                                                                                                                                                              |
| `outputFile`                                  | `outputFile` (`@cancjs/node/fs/extra`)        | Creates parent directories before writing file.                                                                                                                                                                                                                                                              |
| `outputFileSync`                              | `outputFileSync` (`@cancjs/node/fs/extra`)    | Synchronous twin.                                                                                                                                                                                                                                                                                            |
| `outputJson`                                  | `outputJson` (`@cancjs/node/fs/extra`)        | Formats JSON and creates parent directories before writing.                                                                                                                                                                                                                                                  |
| `outputJsonSync`                              | `outputJsonSync` (`@cancjs/node/fs/extra`)    | Synchronous twin.                                                                                                                                                                                                                                                                                            |
| `pathExists`                                  | `pathExists` (`@cancjs/node/fs/extra`)        | Alias of `exists` from `@cancjs/node/fs`.                                                                                                                                                                                                                                                                    |
| `pathExistsSync`                              | `existsSync` (`@cancjs/node/fs/sync`)         | Synchronous check.                                                                                                                                                                                                                                                                                           |
| `readJson`                                    | `readJson` (`@cancjs/node/fs/extra`)          | Strips UTF-8 BOM. Rejects with `JsonParseError` carrying file path on syntax error. Pass `{ throws: false }` to resolve `null` on parse error; missing file still rejects `ENOENT`.                                                                                                                          |
| `readJsonSync`                                | `readJsonSync` (`@cancjs/node/fs/extra`)      | Synchronous twin. Pass `{ throws: false }` to resolve `null` on parse error; missing file still throws `ENOENT`.                                                                                                                                                                                             |
| `remove`                                      | `rm` (`@cancjs/node/fs`)                      | Not shipped in `/fs/extra`. Use `rm(path, { recursive: true, force: true })` from `@cancjs/node/fs`, available in Node.js core since v14.14.                                                                                                                                                                 |
| `removeSync`                                  | `rmSync` (`@cancjs/node/fs/sync`)             | Use `rmSync(path, { recursive: true, force: true })` from `@cancjs/node/fs/sync`.                                                                                                                                                                                                                            |
| `writeJson`                                   | `writeJson` (`@cancjs/node/fs/extra`)         | Formats and writes JSON data.                                                                                                                                                                                                                                                                                |
| `writeJsonSync`                               | `writeJsonSync` (`@cancjs/node/fs/extra`)     | Synchronous twin.                                                                                                                                                                                                                                                                                            |
| -                                             | `replaceFile` (`@cancjs/node/fs/extra`)       | Additive. Atomic replacement via temporary file and rename. Unlinks temporary file on cancel. Does not `fsync`.                                                                                                                                                                                              |
| -                                             | `replaceFileSync` (`@cancjs/node/fs/extra`)   | Synchronous twin. Does not `fsync`.                                                                                                                                                                                                                                                                          |
| -                                             | `walk` (`@cancjs/node/fs/extra`)              | Additive. Cancelable directory traversal returning async iterable.                                                                                                                                                                                                                                           |
| -                                             | `walkSync` (`@cancjs/node/fs/extra`)          | Synchronous twin returning generator.                                                                                                                                                                                                                                                                        |

### Migration from klaw

| klaw feature     | walk (@cancjs/node/fs/extra)                                               | Differences and notes                                                                                                         |
| ---------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Stream interface | `AsyncIterable<IWalkEntry>` (`walk`), `Generator<IWalkEntry>` (`walkSync`) | Consumable via `for await (... of ...)` or sync `for (... of ...)`. Cancelable via iterator `return()`.                       |
| Entry stats      | `{ stats: false }` by default                                              | Yields `Dirent` entries without issuing extra stat syscalls. Set `{ stats: true }` when file metadata is required.            |
| Filter predicate | Filter on `Dirent` before descending                                       | Evaluates filter before stat syscall and before descending into child directories, pruning subtrees without traversing them.  |
| Traversal order  | `order: 'breadth-first' \| 'depth-first' \| 'children-first'`              | Explicit ordering options. `children-first` yields children before parent directory for bottom-up processing.                 |
| Error handling   | `onError: 'throw' \| 'skip' \| 'yield'`                                    | Controls error policy without event listeners. `'yield'` emits `{ path, error }` entries so the caller handles errors inline. |
| Symlink handling | `followSymlinks: false` with cycle detection                               | Symlink cycle detection prevents infinite loops when `followSymlinks: true`.                                                  |
| Depth limiting   | `depth: Infinity` (default)                                                | Numerical depth limit where `0` inspects root entries only without descending.                                                |

## API

### Error guards

- `isNotFoundError(error)`: tests for `ENOENT`
- `isPermissionError(error)`: tests for `EACCES`, `EPERM`, `EROFS`, and permission errors
- `isExistsError(error)`: tests for `EEXIST`
- `isIsDirError(error)`: tests for `EISDIR`
- `isNotDirError(error)`: tests for `ENOTDIR`
- `isNotEmptyError(error)`: tests for `ENOTEMPTY`
- `isBusyError(error)`: tests for `EBUSY` and `EAGAIN`
- `isNoSpaceError(error)`: tests for `ENOSPC` and `EDQUOT`
- `isTooManyFilesError(error)`: tests for `EMFILE` and `ENFILE`
- `isCrossDeviceError(error)`: tests for `EXDEV`
- `isErrno(code)`: factory creating a guard for a specific errno code string

### Error classes

- `NotImplementedError`: thrown when a version-gated export is invoked on an older runtime
- `ProcessExitError`: thrown when a child process exits with a non-zero exit code or is terminated by a signal
- `ProcessSpawnError`: thrown when a child process fails to spawn
- `JsonParseError`: thrown when parsing JSON input fails

### Feature detection

- `features`: frozen object containing detected runtime version properties (`nodeVersion`, `nodeMajor`) and module-level capability flags (`hasGlob`, `hasMkdtempDisposable`, `hasStatfs`, `hasAddAbortListener`, `hasAsyncDispose`, `hasConsumersBytes`, `hasSqlite`, `hasWorkerLocks`)

## Compatibility

Node.js 18 and later, TypeScript 4.2 and later. Requires `@cancjs/promise >=1.0.0` as a peer dependency. Everything else follows [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

## Documentation

- [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for core promise cancellation mechanics
- [`@cancjs/coroutine`](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine) for structured generator-based flows
- [`@cancjs/toolbox`](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox) for async utilities and timeouts
- [Examples](https://github.com/cancjs/canc/tree/master/examples) for application integration examples

## Credits

This package references and adapts patterns from several open source projects:

- [fs-extra](https://github.com/jprichardson/node-fs-extra) ([MIT](./LICENSES/fs-extra-MIT.txt)) for extended filesystem helper API conventions
- [klaw](https://github.com/jprichardson/node-klaw) ([MIT](./LICENSES/klaw-MIT.txt)) for recursive directory walk semantics
- [graceful-fs](https://github.com/isaacs/node-graceful-fs) ([ISC](./LICENSES/graceful-fs-ISC.txt)) for filesystem normalization and retry patterns

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](./LICENSE)
