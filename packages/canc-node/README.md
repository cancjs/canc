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

Subpath module wrappers are under active development and scheduled for upcoming releases. The root entry `@cancjs/node` provides shared error classes, errno predicates, and runtime feature detection used across all subpaths.

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
import { features, isNotFoundError } from '@cancjs/node';

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

Feature detection probes capability support at module load time without sniffing versions or inspecting vendor-specific globals.

## Description

### Subpath support

<!-- generated:start -->

#### fs

| Export              | Category | Node | Signal              | Deno | Bun |
| ------------------- | -------- | ---- | ------------------- | ---- | --- |
| `access`            | D        | 18+  | -                   | ✅   | ✅  |
| `appendFile`        | A        | 18+  | works, undocumented | ✅   | ✅  |
| `chmod`             | D        | 18+  | -                   | ✅   | ✅  |
| `chown`             | D        | 18+  | -                   | ✅   | ✅  |
| `constants`         | -        | 18+  | -                   | ✅   | ✅  |
| `copyFile`          | A        | 18+  | -                   | ✅   | ✅  |
| `cp`                | A        | 18+  | -                   | ✅   | ✅  |
| `glob`              | A        | 22+  | -                   | ✅   | ✅  |
| `lchmod`            | D        | 18+  | -                   | ✅   | ✅  |
| `lchown`            | D        | 18+  | -                   | ✅   | ✅  |
| `link`              | D        | 18+  | -                   | ✅   | ✅  |
| `lstat`             | D        | 18+  | v26.8.0             | ✅   | ✅  |
| `lutimes`           | D        | 18+  | -                   | ✅   | ✅  |
| `mkdir`             | D        | 18+  | -                   | ✅   | ✅  |
| `mkdtemp`           | D        | 18+  | -                   | ✅   | ✅  |
| `mkdtempDisposable` | D        | 24+  | -                   | ✅   | ✖   |
| `open`              | A        | 18+  | -                   | ✅   | ✅  |
| `opendir`           | A        | 18+  | -                   | 🚧   | ✅  |
| `readFile`          | A        | 18+  | v15.2.0             | ✅   | ✅  |
| `readdir`           | D        | 18+  | -                   | ✅   | ✅  |
| `readlink`          | D        | 18+  | -                   | ✅   | ✅  |
| `realpath`          | D        | 18+  | -                   | ✅   | ✅  |
| `rename`            | D        | 18+  | -                   | ✅   | ✅  |
| `rm`                | A        | 18+  | -                   | ✅   | ✅  |
| `rmdir`             | D        | 18+  | -                   | ✅   | ✅  |
| `stat`              | D        | 18+  | v26.8.0             | ✅   | ✅  |
| `statfs`            | D        | 18+  | -                   | ✅   | ✅  |
| `symlink`           | D        | 18+  | -                   | ✅   | ✅  |
| `truncate`          | D        | 18+  | -                   | ✅   | ✅  |
| `unlink`            | D        | 18+  | -                   | ✅   | ✅  |
| `utimes`            | D        | 18+  | -                   | ✅   | ✅  |
| `watch`             | A        | 18+  | v15.9.0             | ✅   | ✅  |
| `writeFile`         | A        | 18+  | v15.2.0             | ✅   | ✅  |

#### FileHandle (fs)

| Export                  | Category | Node | Signal  | Deno | Bun |
| ----------------------- | -------- | ---- | ------- | ---- | --- |
| `[Symbol.asyncDispose]` | -        | 18+  | -       | ✅   | ✅  |
| `appendFile`            | A        | 18+  | v22.0.0 | ✅   | ✅  |
| `chmod`                 | D        | 18+  | -       | ✅   | ✅  |
| `chown`                 | D        | 18+  | -       | ✅   | ✅  |
| `close`                 | D        | 18+  | -       | ✅   | ✅  |
| `createReadStream`      | A        | 18+  | v20.0.0 | ✅   | ✅  |
| `createWriteStream`     | A        | 18+  | -       | ✅   | ✅  |
| `datasync`              | D        | 18+  | -       | ✅   | ✅  |
| `fd`                    | -        | 18+  | -       | ✅   | ✅  |
| `pull`                  | A        | 26+  | v25.9.0 | ✖    | ✖   |
| `pullSync`              | -        | 26+  | -       | ✖    | ✖   |
| `read`                  | B        | 18+  | -       | ✅   | ✅  |
| `readableWebStream`     | A        | 18+  | -       | ✅   | ✅  |
| `readFile`              | A        | 18+  | v15.2.0 | ✅   | ✅  |
| `readLines`             | A        | 18+  | -       | ✅   | ✅  |
| `readv`                 | B        | 18+  | -       | ✅   | ✅  |
| `stat`                  | D        | 18+  | v26.1.0 | ✅   | ✅  |
| `sync`                  | D        | 18+  | -       | ✅   | ✅  |
| `truncate`              | D        | 18+  | -       | ✅   | ✅  |
| `Type`                  | -        | 22+  | -       | ✅   | ✅  |
| `utimes`                | D        | 18+  | -       | ✅   | ✅  |
| `write`                 | B        | 18+  | -       | ✅   | ✅  |
| `writeFile`             | A        | 18+  | v22.0.0 | ✅   | ✅  |
| `writer`                | A        | 26+  | -       | ✖    | ✖   |
| `writev`                | B        | 18+  | -       | ✅   | ✅  |

<!-- generated:end -->

### Planned subpaths

Wrapped built-in modules are arriving in upcoming releases. Planned subpaths include:

- `fs`: file system operations with cancelable promises
- `fs/sync`: synchronous file system utilities
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

- `features`: frozen object containing module-level capability flags (`hasGlob`, `hasMkdtempDisposable`, `hasStatfs`, `hasAddAbortListener`, `hasAsyncDispose`, `hasConsumersBytes`, `hasSqlite`, `hasWorkerLocks`)

## Compatibility

Node.js 18 and later, TypeScript 4.2 and later. Requires `@cancjs/promise >=1.0.0` as a peer dependency. Everything else follows [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise#compatibility).

## Documentation

- [`@cancjs/promise`](https://github.com/cancjs/canc/tree/master/packages/canc-promise) for core promise cancellation mechanics
- [`@cancjs/coroutine`](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine) for structured generator-based flows
- [`@cancjs/toolbox`](https://github.com/cancjs/canc/tree/master/packages/canc-toolbox) for async utilities and timeouts
- [Examples](https://github.com/cancjs/canc/tree/master/examples) for application integration examples

## Contributing

You are welcome to participate through issues and pull requests!

## License

[MIT](./LICENSE)
