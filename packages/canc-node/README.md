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

| Export     | Cancellation   | Node | Deno | Bun     |
| ---------- | -------------- | ---- | ---- | ------- |
| `exec`     | stops the work | 18+  | ✅   | ✅      |
| `execFile` | stops the work | 18+  | ✅   | ✅      |
| `spawn`    | stops the work | 18+  | ✅   | partial |
| `fork`     | stops the work | 18+  | ✅   | partial |

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

<!-- generated:end -->

`walk` and `walkSync` are iterables stopped with `break` or `return()` rather than `.cancel()`, so their cancellation cell reads `-`.

### Shipped subpaths

The package currently ships three subpaths:

- `fs`: file system operations with cancelable promises
- `fs/sync`: synchronous file system utilities
- `fs/register-graceful`: automatic graceful-fs integration hook

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

```ts
import "@cancjs/node/fs/register-graceful";
```

### Planned subpaths

Wrapped built-in modules are arriving in upcoming releases. Planned subpaths include:

- `fs/extra`: extended file system helper routines
- `child-process`: process execution and spawning with cancellation
- `timers`: cancelable timer promises
- `stream`: stream consumers and pipeline helpers
- `events`: event listener helpers and cancelable event promises
- `dns`: cancelable DNS resolution
- `net`: networking helpers
- `tls`: TLS socket utilities
- `http`: HTTP, HTTPS, and HTTP/2 clients and servers
- `crypto`: cancelable cryptographic operations
- `zlib`: cancelable compression utilities
- `worker-threads`: worker thread coordination
- `readline`: cancelable line-by-line reading
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
- `ProcessExitError`: thrown when a child process exits with a non-zero exit code
- `ProcessSignalError`: thrown when a child process is terminated by a signal
- `ProcessSpawnError`: thrown when a child process fails to spawn
- `ProcessMaxBufferError`: thrown when child process output exceeds the configured buffer limit
- `ProcessIpcError`: thrown when an IPC channel disconnects unexpectedly
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
