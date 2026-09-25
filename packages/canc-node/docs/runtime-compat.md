# Runtime compatibility

Compatibility matrix across Node.js major versions, Deno, and Bun.

Two axes are kept distinct:

- The Node.js version axis is documentation-derived from official Node.js API documentation across tracked major versions.
- The alternative runtime axis is execution-derived from live runtime probes executed in each target environment.

<!-- generated:start -->

## Versions under test

| Runtime        | Version       | Source                                |
| -------------- | ------------- | ------------------------------------- |
| Node.js 18     | v18.20.8      | Latest release for major (EOL)        |
| Node.js 20     | v20.20.2      | Latest release for major (EOL)        |
| Node.js 22     | v22.23.2      | Latest release for major (LTS)        |
| Node.js 24     | v24.20.0      | Latest release for major (Active LTS) |
| Node.js 26     | v26.8.1       | Latest release for major (Current)    |
| Deno           | 2.9.4         | Installed test environment            |
| Bun            | 1.3.14        | Installed test environment            |
| Execution host | node v24.18.1 | Probe execution environment           |

## Documentation-derived: Node.js major versions

The matrix below shows availability and documented abort signal support across tracked Node.js major versions.

Legend: `S` = Documented signal option, `y` = Present without signal, `-` = Absent in major.

### child-process (node:child_process)

| Export     | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| ---------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `exec`     | S   | S   | S   | S   | S   | v15.4.0      | v0.1.90 |
| `execFile` | S   | S   | S   | S   | S   | v15.4.0      | v0.1.91 |
| `spawn`    | S   | S   | S   | S   | S   | v15.4.0      | v0.1.90 |
| `fork`     | S   | S   | S   | S   | S   | v15.4.0      | v0.5.0  |

### crypto (node:crypto)

| Export            | 18  | 20  | 22  | 24  | 26  | Signal since | Added    |
| ----------------- | --- | --- | --- | --- | --- | ------------ | -------- |
| `argon2`          | -   | -   | -   | y   | y   | -            | v24.7.0  |
| `checkPrime`      | y   | y   | y   | y   | y   | -            | v15.8.0  |
| `decapsulate`     | -   | -   | -   | y   | y   | -            | v24.7.0  |
| `encapsulate`     | -   | -   | -   | y   | y   | -            | v24.7.0  |
| `generateKey`     | y   | y   | y   | y   | y   | -            | v15.0.0  |
| `generateKeyPair` | y   | y   | y   | y   | y   | -            | v10.12.0 |
| `generatePrime`   | y   | y   | y   | y   | y   | -            | v15.8.0  |
| `hkdf`            | y   | y   | y   | y   | y   | -            | v15.0.0  |
| `pbkdf2`          | y   | y   | y   | y   | y   | -            | v0.5.5   |
| `randomBytes`     | y   | y   | y   | y   | y   | -            | v0.5.8   |
| `randomFill`      | y   | y   | y   | y   | y   | -            | v7.10.0  |
| `scrypt`          | y   | y   | y   | y   | y   | -            | v10.5.0  |

### Socket (dgram)

| Export | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| ------ | --- | --- | --- | --- | --- | ------------ | ------- |
| `send` | y   | y   | y   | y   | y   | -            | v0.1.99 |

### dns (node:dns/promises)

| Export                  | 18  | 20  | 22  | 24  | 26  | Signal since | Added    |
| ----------------------- | --- | --- | --- | --- | --- | ------------ | -------- |
| `resolve`               | y   | y   | y   | y   | y   | -            | v0.1.27  |
| `resolve4`              | y   | y   | y   | y   | y   | -            | v0.1.16  |
| `resolve6`              | y   | y   | y   | y   | y   | -            | v0.1.16  |
| `resolveAny`            | y   | y   | y   | y   | y   | -            | -        |
| `resolveCaa`            | y   | y   | y   | y   | y   | -            | v15.0.0  |
| `resolveCname`          | y   | y   | y   | y   | y   | -            | v0.3.2   |
| `resolveMx`             | y   | y   | y   | y   | y   | -            | v0.1.27  |
| `resolveNaptr`          | y   | y   | y   | y   | y   | -            | v0.9.12  |
| `resolveNs`             | y   | y   | y   | y   | y   | -            | v0.1.90  |
| `resolvePtr`            | y   | y   | y   | y   | y   | -            | v6.0.0   |
| `resolveSoa`            | y   | y   | y   | y   | y   | -            | v0.11.10 |
| `resolveSrv`            | y   | y   | y   | y   | y   | -            | v0.1.27  |
| `resolveTxt`            | y   | y   | y   | y   | y   | -            | v0.1.27  |
| `reverse`               | y   | y   | y   | y   | y   | -            | v0.1.16  |
| `lookup`                | y   | y   | y   | y   | y   | -            | v0.1.90  |
| `lookupService`         | y   | y   | y   | y   | y   | -            | v0.11.14 |
| `resolveTlsa`           | -   | -   | y   | y   | y   | -            | v23.9.0  |
| `getServers`            | y   | y   | y   | y   | y   | -            | v0.11.3  |
| `setServers`            | y   | y   | y   | y   | y   | -            | v0.11.3  |
| `getDefaultResultOrder` | y   | y   | y   | y   | y   | -            | v20.1.0  |
| `setDefaultResultOrder` | y   | y   | y   | y   | y   | -            | v16.4.0  |
| `Resolver`              | y   | y   | y   | y   | y   | -            | v8.3.0   |

### dnsPromises (dns)

| Export     | 18  | 20  | 22  | 24  | 26  | Signal since | Added  |
| ---------- | --- | --- | --- | --- | --- | ------------ | ------ |
| `Resolver` | y   | y   | y   | y   | y   | -            | v8.3.0 |

### Resolver (dns)

| Export            | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| ----------------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `Resolver`        | y   | y   | y   | y   | y   | -            | v8.3.0  |
| `cancel`          | y   | y   | y   | y   | y   | -            | v8.3.0  |
| `setLocalAddress` | y   | y   | y   | y   | y   | -            | v15.1.0 |

### events (node:events)

| Export                                           | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| ------------------------------------------------ | --- | --- | --- | --- | --- | ------------ | ------- |
| `once`                                           | y   | y   | y   | y   | y   | v11.13.0     | v14.5.0 |
| `on`                                             | y   | y   | y   | y   | y   | v13.6.0      | v14.5.0 |
| `addAbortListener`                               | S   | S   | S   | S   | S   | v20.5.0      | v20.5.0 |
| `EventEmitter`                                   | y   | y   | y   | y   | y   | -            | v0.1.26 |
| `EventTarget`                                    | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `NodeEventTarget`                                | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `CustomEvent`                                    | y   | y   | y   | y   | y   | -            | v18.7.0 |
| `Event`                                          | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `EventEmitterAsyncResource`                      | y   | y   | y   | y   | -   | -            | v17.4.0 |
| `EventEmitterAsyncResource extends EventEmitter` | -   | -   | -   | -   | y   | -            | v17.4.0 |
| `captureRejectionSymbol`                         | y   | y   | -   | -   | y   | -            | v13.4.0 |
| `captureRejections`                              | y   | y   | -   | -   | y   | -            | v13.4.0 |
| `defaultMaxListeners`                            | y   | y   | y   | y   | y   | -            | v0.11.2 |
| `errorMonitor`                                   | y   | y   | y   | y   | y   | -            | v13.6.0 |
| `getEventListeners`                              | y   | y   | y   | y   | y   | -            | v15.2.0 |
| `getMaxListeners`                                | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `listenerCount`                                  | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `setMaxListeners`                                | y   | y   | y   | y   | y   | -            | v14.5.0 |

### Event (events)

| Export                     | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| -------------------------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `composedPath`             | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `initEvent`                | -   | y   | y   | y   | y   | -            | v19.5.0 |
| `preventDefault`           | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `stopImmediatePropagation` | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `stopPropagation`          | y   | y   | y   | y   | y   | -            | v14.5.0 |

### EventEmitter (events)

| Export                | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| --------------------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `addListener`         | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `emit`                | y   | y   | y   | y   | y   | -            | v15.2.0 |
| `eventNames`          | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `getMaxListeners`     | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `listenerCount`       | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `listeners`           | y   | y   | y   | y   | y   | -            | v0.1.26 |
| `off`                 | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `on`                  | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `once`                | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `prependListener`     | y   | y   | y   | y   | y   | -            | v6.0.0  |
| `prependOnceListener` | y   | y   | y   | y   | y   | -            | v6.0.0  |
| `rawListeners`        | y   | y   | y   | y   | y   | -            | v9.4.0  |
| `removeAllListeners`  | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `removeListener`      | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `setMaxListeners`     | y   | y   | y   | y   | y   | -            | v14.5.0 |

### EventEmitterAsyncResource (events)

| Export        | 18  | 20  | 22  | 24  | 26  | Signal since | Added |
| ------------- | --- | --- | --- | --- | --- | ------------ | ----- |
| `emitDestroy` | -   | -   | -   | -   | y   | -            | -     |

### EventEmitterAsyncResource extends EventEmitter (events)

| Export        | 18  | 20  | 22  | 24  | 26  | Signal since | Added |
| ------------- | --- | --- | --- | --- | --- | ------------ | ----- |
| `emitDestroy` | -   | -   | -   | -   | y   | -            | -     |

### EventTarget (events)

| Export                | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| --------------------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `addEventListener`    | S   | S   | S   | S   | S   | v14.5.0      | v14.5.0 |
| `dispatchEvent`       | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `removeEventListener` | y   | y   | y   | y   | y   | -            | v14.5.0 |

### NodeEventTarget (events)

| Export               | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| -------------------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `addListener`        | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `emit`               | y   | y   | y   | y   | y   | -            | v15.2.0 |
| `eventNames`         | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `getMaxListeners`    | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `listenerCount`      | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `off`                | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `on`                 | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `once`               | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `removeAllListeners` | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `removeListener`     | y   | y   | y   | y   | y   | -            | v14.5.0 |
| `setMaxListeners`    | y   | y   | y   | y   | y   | -            | v14.5.0 |

### fs (node:fs/promises)

| Export              | 18  | 20  | 22  | 24  | 26  | Signal since        | Added    |
| ------------------- | --- | --- | --- | --- | --- | ------------------- | -------- |
| `access`            | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `appendFile`        | y   | y   | y   | y   | y   | works, undocumented | v10.0.0  |
| `chmod`             | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `chown`             | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `copyFile`          | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `cp`                | y   | y   | y   | y   | y   | -                   | v16.7.0  |
| `glob`              | -   | -   | y   | y   | y   | -                   | v22.0.0  |
| `lchmod`            | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `lchown`            | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `link`              | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `lstat`             | y   | y   | y   | y   | S   | v26.8.0             | v10.0.0  |
| `lutimes`           | y   | y   | y   | y   | y   | -                   | v14.5.0  |
| `mkdir`             | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `mkdtemp`           | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `mkdtempDisposable` | -   | -   | -   | y   | y   | -                   | v24.4.0  |
| `open`              | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `opendir`           | y   | y   | y   | y   | y   | -                   | v12.12.0 |
| `readFile`          | S   | S   | S   | S   | S   | v15.2.0             | v10.0.0  |
| `readdir`           | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `readlink`          | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `realpath`          | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `rename`            | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `rm`                | y   | y   | y   | y   | y   | -                   | v14.14.0 |
| `rmdir`             | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `stat`              | y   | y   | y   | y   | S   | v26.8.0             | v10.0.0  |
| `statfs`            | y   | y   | y   | y   | y   | -                   | v19.6.0  |
| `symlink`           | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `truncate`          | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `unlink`            | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `utimes`            | y   | y   | y   | y   | y   | -                   | v10.0.0  |
| `watch`             | S   | S   | S   | S   | S   | v15.9.0             | v15.9.0  |
| `writeFile`         | S   | S   | S   | S   | S   | v15.2.0             | v10.0.0  |

### FileHandle (fs)

| Export                  | 18  | 20  | 22  | 24  | 26  | Signal since | Added    |
| ----------------------- | --- | --- | --- | --- | --- | ------------ | -------- |
| `[Symbol.asyncDispose]` | y   | y   | y   | y   | y   | -            | v20.4.0  |
| `appendFile`            | y   | y   | S   | S   | S   | v22.0.0      | v10.0.0  |
| `chmod`                 | y   | y   | y   | y   | y   | -            | v10.0.0  |
| `chown`                 | y   | y   | y   | y   | y   | -            | v10.0.0  |
| `close`                 | y   | y   | y   | y   | y   | -            | v10.0.0  |
| `createReadStream`      | y   | S   | S   | S   | S   | v20.0.0      | v16.11.0 |
| `createWriteStream`     | y   | y   | y   | y   | y   | -            | v16.11.0 |
| `datasync`              | y   | y   | y   | y   | y   | -            | v10.0.0  |
| `pull`                  | -   | -   | -   | S   | S   | v24.20.0     | v25.9.0  |
| `read`                  | y   | y   | y   | y   | y   | -            | v10.0.0  |
| `readableWebStream`     | y   | y   | y   | y   | y   | -            | v17.0.0  |
| `readFile`              | S   | S   | S   | S   | S   | v15.2.0      | v10.0.0  |
| `readLines`             | y   | y   | y   | y   | y   | -            | v18.11.0 |
| `readv`                 | y   | y   | y   | y   | y   | -            | v13.13.0 |
| `stat`                  | y   | y   | y   | S   | S   | v24.16.0     | v10.0.0  |
| `sync`                  | y   | y   | y   | y   | y   | -            | v10.0.0  |
| `truncate`              | y   | y   | y   | y   | y   | -            | v10.0.0  |
| `utimes`                | y   | y   | y   | y   | y   | -            | v10.0.0  |
| `write`                 | y   | y   | y   | y   | y   | -            | v10.0.0  |
| `writeFile`             | y   | y   | S   | S   | S   | v22.0.0      | v10.0.0  |
| `writer`                | -   | -   | -   | y   | y   | -            | v25.9.0  |
| `writev`                | y   | y   | y   | y   | y   | -            | v12.9.0  |

### readline (node:readline/promises)

| Export               | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| -------------------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `createInterface`    | y   | S   | S   | S   | S   | v20.0.0      | v17.0.0 |
| `emitKeypressEvents` | y   | y   | y   | y   | y   | -            | v0.7.7  |

### InterfaceConstructor (readline)

| Export                   | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| ------------------------ | --- | --- | --- | --- | --- | ------------ | ------- |
| `[Symbol.asyncIterator]` | -   | -   | -   | -   | -   | -            | -       |
| `[Symbol.dispose]`       | -   | -   | -   | -   | -   | v23.10.0     | v22.0.0 |
| `close`                  | y   | y   | y   | y   | y   | -            | v0.1.98 |
| `getCursorPos`           | y   | y   | y   | y   | y   | -            | v13.5.0 |
| `getPrompt`              | y   | y   | y   | y   | y   | -            | v15.3.0 |
| `pause`                  | y   | y   | y   | y   | y   | -            | v0.3.4  |
| `prompt`                 | y   | y   | y   | y   | y   | -            | v0.1.98 |
| `resume`                 | y   | y   | y   | y   | y   | -            | v0.3.4  |
| `setPrompt`              | y   | y   | y   | y   | y   | -            | v0.1.98 |
| `write`                  | y   | y   | y   | y   | y   | -            | v0.1.98 |

### readlinePromises (readline)

| Export      | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| ----------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `Interface` | y   | y   | y   | y   | y   | -            | v17.0.0 |
| `Readline`  | y   | y   | y   | y   | y   | -            | v17.0.0 |

### readlinePromises.Interface (readline)

| Export     | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| ---------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `question` | S   | S   | S   | S   | S   | v17.0.0      | v17.0.0 |

### readlinePromises.Readline (readline)

| Export            | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| ----------------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `clearLine`       | y   | y   | y   | y   | y   | -            | v17.0.0 |
| `clearScreenDown` | y   | y   | y   | y   | y   | -            | v17.0.0 |
| `commit`          | y   | y   | y   | y   | y   | -            | v17.0.0 |
| `cursorTo`        | y   | y   | y   | y   | y   | -            | v17.0.0 |
| `moveCursor`      | y   | y   | y   | y   | y   | -            | v17.0.0 |
| `rollback`        | y   | y   | y   | y   | y   | -            | v17.0.0 |

### stream (node:stream)

| Export                    | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| ------------------------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `pipeline`                | y   | y   | y   | y   | y   | v15.0.0      | v10.0.0 |
| `finished`                | y   | S   | S   | S   | S   | v15.0.0      | v10.0.0 |
| `addAbortSignal`          | S   | S   | S   | S   | S   | v15.4.0      | v15.4.0 |
| `compose`                 | y   | y   | y   | y   | y   | -            | v16.9.0 |
| `duplexPair`              | -   | y   | y   | y   | y   | -            | v22.6.0 |
| `from`                    | y   | y   | y   | y   | y   | -            | v12.3.0 |
| `fromWeb`                 | S   | S   | S   | S   | S   | v17.0.0      | v17.0.0 |
| `toWeb`                   | y   | y   | y   | y   | y   | -            | v17.0.0 |
| `getDefaultHighWaterMark` | y   | y   | y   | y   | y   | -            | v19.9.0 |
| `setDefaultHighWaterMark` | y   | y   | y   | y   | y   | -            | v19.9.0 |
| `isDestroyed`             | -   | -   | -   | y   | y   | -            | v19.9.0 |
| `isDisturbed`             | y   | y   | y   | y   | y   | -            | v16.8.0 |
| `isErrored`               | y   | y   | y   | y   | y   | -            | v17.3.0 |
| `isReadable`              | y   | y   | y   | y   | y   | -            | v17.4.0 |
| `isWritable`              | -   | -   | y   | y   | y   | -            | -       |
| `push`                    | y   | y   | y   | y   | y   | -            | -       |
| `read`                    | y   | y   | y   | y   | y   | -            | -       |
| `_construct`              | y   | y   | y   | y   | y   | -            | v15.0.0 |
| `_destroy`                | y   | y   | y   | y   | y   | -            | v8.0.0  |
| `_read`                   | y   | y   | y   | y   | y   | -            | v0.9.4  |
| `_flush`                  | y   | y   | y   | y   | y   | -            | -       |
| `_transform`              | y   | y   | y   | y   | y   | -            | -       |
| `_final`                  | y   | y   | y   | y   | y   | -            | v8.0.0  |
| `_write`                  | y   | y   | y   | y   | y   | -            | -       |
| `_writev`                 | y   | y   | y   | y   | y   | -            | -       |
| `text`                    | -   | -   | -   | -   | -   | -            | -       |
| `json`                    | -   | -   | -   | -   | -   | -            | -       |
| `buffer`                  | -   | -   | -   | -   | -   | -            | -       |
| `arrayBuffer`             | -   | -   | -   | -   | -   | -            | -       |
| `blob`                    | -   | -   | -   | -   | -   | -            | -       |
| `bytes`                   | -   | -   | -   | -   | -   | -            | v24.0.0 |

### stream (stream)

| Export        | 18  | 20  | 22  | 24  | 26  | Signal since | Added  |
| ------------- | --- | --- | --- | --- | --- | ------------ | ------ |
| `Readable`    | y   | y   | y   | y   | y   | -            | v0.9.4 |
| `Writable`    | y   | y   | y   | y   | y   | -            | v0.9.4 |
| `Duplex`      | y   | y   | y   | y   | y   | -            | v0.9.4 |
| `Transform`   | y   | y   | y   | y   | y   | -            | v0.9.4 |
| `PassThrough` | y   | y   | y   | y   | y   | -            | -      |

### stream.Readable (stream)

| Export           | 18  | 20  | 22  | 24  | 26  | Signal since | Added    |
| ---------------- | --- | --- | --- | --- | --- | ------------ | -------- |
| `asIndexedPairs` | S   | S   | -   | -   | -   | v17.5.0      | v17.5.0  |
| `compose`        | y   | y   | y   | y   | y   | v19.1.0      | v16.9.0  |
| `destroy`        | y   | y   | y   | y   | y   | -            | v8.0.0   |
| `drop`           | S   | S   | S   | S   | S   | v17.5.0      | v17.5.0  |
| `every`          | S   | S   | S   | S   | S   | v17.5.0      | v17.5.0  |
| `filter`         | S   | S   | S   | S   | S   | v17.4.0      | v17.4.0  |
| `find`           | S   | S   | S   | S   | S   | v17.5.0      | v17.5.0  |
| `flatMap`        | S   | S   | S   | S   | S   | v17.5.0      | v17.5.0  |
| `forEach`        | S   | S   | S   | S   | S   | v17.5.0      | v17.5.0  |
| `isPaused`       | y   | y   | y   | y   | y   | -            | v0.11.14 |
| `iterator`       | y   | y   | y   | y   | y   | -            | v16.3.0  |
| `map`            | S   | S   | S   | S   | S   | v17.4.0      | v17.4.0  |
| `pause`          | y   | y   | y   | y   | y   | -            | v0.9.4   |
| `pipe`           | y   | y   | y   | y   | y   | -            | v0.9.4   |
| `read`           | y   | y   | y   | y   | y   | -            | -        |
| `reduce`         | S   | S   | S   | S   | S   | v17.5.0      | v17.5.0  |
| `resume`         | y   | y   | y   | y   | y   | -            | v0.9.4   |
| `setEncoding`    | y   | y   | y   | y   | y   | -            | v0.9.4   |
| `some`           | S   | S   | S   | S   | S   | v17.5.0      | v17.5.0  |
| `take`           | S   | S   | S   | S   | S   | v17.5.0      | v17.5.0  |
| `toArray`        | S   | S   | S   | S   | S   | v17.5.0      | v17.5.0  |
| `unpipe`         | y   | y   | y   | y   | y   | -            | v0.9.4   |
| `unshift`        | y   | y   | y   | y   | y   | -            | v0.9.11  |
| `wrap`           | y   | y   | y   | y   | y   | -            | v0.9.4   |

### stream.Transform (stream)

| Export    | 18  | 20  | 22  | 24  | 26  | Signal since | Added  |
| --------- | --- | --- | --- | --- | --- | ------------ | ------ |
| `destroy` | y   | y   | y   | y   | y   | -            | v8.0.0 |

### stream.Writable (stream)

| Export               | 18  | 20  | 22  | 24  | 26  | Signal since | Added    |
| -------------------- | --- | --- | --- | --- | --- | ------------ | -------- |
| `cork`               | y   | y   | y   | y   | y   | -            | v0.11.2  |
| `destroy`            | y   | y   | y   | y   | y   | -            | v8.0.0   |
| `end`                | y   | y   | y   | y   | y   | -            | v0.9.4   |
| `setDefaultEncoding` | y   | y   | y   | y   | y   | -            | v0.11.15 |
| `uncork`             | y   | y   | y   | y   | y   | -            | v0.11.2  |
| `write`              | y   | y   | y   | y   | y   | -            | v0.9.4   |

### timers (node:timers/promises)

| Export           | 18  | 20  | 22  | 24  | 26  | Signal since        | Added   |
| ---------------- | --- | --- | --- | --- | --- | ------------------- | ------- |
| `setTimeout`     | y   | y   | y   | y   | y   | v15.0.0             | v0.0.1  |
| `setImmediate`   | y   | y   | y   | y   | y   | v15.0.0             | v0.9.1  |
| `setInterval`    | y   | y   | y   | y   | y   | works, undocumented | v0.0.1  |
| `wait`           | S   | S   | S   | S   | S   | v17.3.0             | v17.3.0 |
| `yield`          | y   | y   | y   | y   | y   | -                   | v17.3.0 |
| `clearImmediate` | y   | y   | y   | y   | y   | -                   | v0.9.1  |
| `clearInterval`  | y   | y   | y   | y   | y   | -                   | v0.0.1  |
| `clearTimeout`   | y   | y   | y   | y   | y   | -                   | v0.0.1  |
| `Immediate`      | y   | y   | y   | y   | y   | -                   | -       |
| `Timeout`        | y   | y   | y   | y   | y   | -                   | -       |

### Immediate (timers)

| Export   | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| -------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `hasRef` | y   | y   | y   | y   | y   | -            | v11.0.0 |
| `ref`    | y   | y   | y   | y   | y   | -            | v9.7.0  |
| `unref`  | y   | y   | y   | y   | y   | -            | v9.7.0  |

### Timeout (timers)

| Export    | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| --------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `close`   | y   | y   | y   | y   | y   | -            | v0.9.1  |
| `hasRef`  | y   | y   | y   | y   | y   | -            | v11.0.0 |
| `ref`     | y   | y   | y   | y   | y   | -            | v9.7.0  |
| `refresh` | y   | y   | y   | y   | y   | -            | v10.2.0 |
| `unref`   | y   | y   | y   | y   | y   | -            | v9.7.0  |

### worker_threads (node:worker_threads)

| Export                | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| --------------------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `postMessageToThread` | -   | y   | y   | y   | y   | -            | v22.5.0 |

### locks.LockManager (worker_threads)

| Export    | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| --------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `query`   | -   | -   | -   | y   | y   | -            | v24.5.0 |
| `request` | -   | -   | -   | S   | S   | v24.5.0      | v24.5.0 |

### Worker (worker_threads)

| Export              | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| ------------------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `cpuUsage`          | -   | -   | y   | y   | y   | -            | v24.6.0 |
| `getHeapSnapshot`   | y   | y   | y   | y   | y   | -            | v13.9.0 |
| `getHeapStatistics` | -   | -   | y   | y   | y   | -            | v24.0.0 |
| `startCpuProfile`   | -   | -   | y   | y   | y   | -            | v24.8.0 |
| `startHeapProfile`  | -   | -   | -   | y   | y   | -            | v24.9.0 |
| `terminate`         | y   | y   | y   | y   | y   | -            | v10.5.0 |

### zlib (node:zlib)

| Export              | 18  | 20  | 22  | 24  | 26  | Signal since | Added   |
| ------------------- | --- | --- | --- | --- | --- | ------------ | ------- |
| `brotliCompress`    | y   | y   | y   | y   | y   | -            | v11.7.0 |
| `brotliDecompress`  | y   | y   | y   | y   | y   | -            | v11.7.0 |
| `compressBrotli`    | -   | -   | -   | y   | y   | -            | v25.9.0 |
| `compressDeflate`   | -   | -   | -   | y   | y   | -            | v25.9.0 |
| `compressGzip`      | -   | -   | -   | y   | y   | -            | v25.9.0 |
| `compressZstd`      | -   | -   | -   | y   | y   | -            | v25.9.0 |
| `decompressBrotli`  | -   | -   | -   | y   | y   | -            | v25.9.0 |
| `decompressDeflate` | -   | -   | -   | y   | y   | -            | v25.9.0 |
| `decompressGzip`    | -   | -   | -   | y   | y   | -            | v25.9.0 |
| `decompressZstd`    | -   | -   | -   | y   | y   | -            | v25.9.0 |
| `deflate`           | y   | y   | y   | y   | y   | -            | v0.6.0  |
| `deflateRaw`        | y   | y   | y   | y   | y   | -            | v0.6.0  |
| `gunzip`            | y   | y   | y   | y   | y   | -            | v0.6.0  |
| `gzip`              | y   | y   | y   | y   | y   | -            | v0.6.0  |
| `inflate`           | y   | y   | y   | y   | y   | -            | v0.6.0  |
| `inflateRaw`        | y   | y   | y   | y   | y   | -            | v0.6.0  |
| `unzip`             | y   | y   | y   | y   | y   | -            | v0.6.0  |
| `zipFiles`          | -   | -   | -   | -   | y   | -            | v26.8.0 |
| `zstdCompress`      | -   | -   | y   | y   | y   | -            | v23.8.0 |
| `zstdDecompress`    | -   | -   | y   | y   | y   | -            | v23.8.0 |

## Execution-derived: alternative runtimes

### Module availability

Live import results across Node.js, Deno, and Bun runtime environments.

| Specifier           | Node.js     | Deno        | Bun         |
| ------------------- | ----------- | ----------- | ----------- |
| `fs`                | 105 exports | 112 exports | 107 exports |
| `fs/promises`       | 34 exports  | 34 exports  | 46 exports  |
| `child_process`     | 10 exports  | 9 exports   | 9 exports   |
| `timers`            | 8 exports   | 8 exports   | 11 exports  |
| `timers/promises`   | 5 exports   | 5 exports   | 5 exports   |
| `stream`            | 24 exports  | 24 exports  | 25 exports  |
| `stream/promises`   | 3 exports   | 3 exports   | 3 exports   |
| `stream/consumers`  | 7 exports   | 7 exports   | 7 exports   |
| `stream/web`        | 18 exports  | 18 exports  | 18 exports  |
| `dns`               | 51 exports  | 50 exports  | 50 exports  |
| `dns/promises`      | 47 exports  | 46 exports  | 46 exports  |
| `events`            | 16 exports  | 13 exports  | 17 exports  |
| `crypto`            | 71 exports  | 67 exports  | 66 exports  |
| `net`               | 18 exports  | 18 exports  | 18 exports  |
| `tls`               | 19 exports  | 21 exports  | 19 exports  |
| `http`              | 22 exports  | 19 exports  | 20 exports  |
| `https`             | 7 exports   | 7 exports   | 7 exports   |
| `http2`             | 12 exports  | 17 exports  | 12 exports  |
| `zlib`              | 48 exports  | 126 exports | 48 exports  |
| `worker_threads`    | 22 exports  | 22 exports  | 17 exports  |
| `readline`          | 9 exports   | 9 exports   | 9 exports   |
| `readline/promises` | 4 exports   | 4 exports   | 4 exports   |
| `dgram`             | 4 exports   | 3 exports   | 3 exports   |
| `sqlite`            | 6 exports   | 5 exports   | missing     |
| `util`              | 35 exports  | 34 exports  | 40 exports  |

### Signal honoring

Live probe results executing candidate operations with a pre-aborted signal.

| Function                | Node.js                   | Deno                        | Bun                       |
| ----------------------- | ------------------------- | --------------------------- | ------------------------- |
| `fs.readFile`           | reject:AbortError         | reject:AbortError           | reject:AbortError         |
| `fs.appendFile`         | reject:AbortError         | reject:AbortError           | reject:AbortError         |
| `fs.writeFile`          | reject:AbortError         | reject:AbortError           | reject:AbortError         |
| `fs.stat`               | resolve (ignored)         | resolve (ignored)           | resolve (ignored)         |
| `fs.lstat`              | resolve (ignored)         | resolve (ignored)           | resolve (ignored)         |
| `fs.readdir`            | resolve (ignored)         | resolve (ignored)           | resolve (ignored)         |
| `fs.access`             | resolve (ignored)         | resolve (ignored)           | resolve (ignored)         |
| `fs.realpath`           | resolve (ignored)         | resolve (ignored)           | resolve (ignored)         |
| `fs.copyFile`           | n/a (no options argument) | n/a (no options argument)   | n/a (no options argument) |
| `fs.open`               | n/a (no options argument) | n/a (no options argument)   | n/a (no options argument) |
| `fs.cp`                 | resolve (ignored)         | resolve (ignored)           | resolve (ignored)         |
| `fs.rm`                 | resolve (ignored)         | resolve (ignored)           | resolve (ignored)         |
| `fs.mkdir`              | resolve (ignored)         | resolve (ignored)           | resolve (ignored)         |
| `fs.opendir`            | resolve (ignored)         | throws ERR_INVALID_ARG_TYPE | resolve (ignored)         |
| `fs.statfs`             | resolve (ignored)         | resolve (ignored)           | resolve (ignored)         |
| `fs.glob`               | resolve (ignored)         | resolve (ignored)           | resolve (ignored)         |
| `fs.watch`              | reject:AbortError         | reject:AbortError           | reject:AbortError         |
| `timers.setTimeout`     | reject:AbortError         | reject:AbortError           | reject:AbortError         |
| `timers.setImmediate`   | reject:AbortError         | reject:AbortError           | reject:AbortError         |
| `timers.scheduler.wait` | reject:AbortError         | reject:AbortError           | reject:AbortError         |
| `events.once`           | reject:AbortError         | reject:AbortError           | reject:AbortError         |
| `events.on`             | reject:AbortError         | reject:AbortError           | reject:AbortError         |
| `consumers.text`        | resolve (ignored)         | resolve (ignored)           | resolve (ignored)         |
| `stream.finished`       | reject:AbortError         | reject:AbortError           | reject:AbortError         |
| `stream.pipeline`       | reject:AbortError         | reject:AbortError           | reject:AbortError         |
| `child_process.exec`    | reject:AbortError         | reject:AbortError           | reject:AbortError         |

### Version gated capabilities

| API                                       | Min Node.js  | Deno       | Bun        | Gate mechanism                              |
| ----------------------------------------- | ------------ | ---------- | ---------- | ------------------------------------------- |
| `fs.statfs`                               | 18.15        | yes        | yes        | feature-detect                              |
| `fs.glob`                                 | 22.0         | yes        | yes        | throw NotImplementedError on older versions |
| `fs.mkdtempDisposable`                    | 24.4         | yes        | no         | feature-detect                              |
| `FileHandle.pull / writer`                | 25.9 (26+)   | no         | no         | feature-detect                              |
| `fs.stat / lstat signal`                  | 26.8         | n/a        | n/a        | conditional forward                         |
| `FileHandle.stat signal`                  | 26.1         | n/a        | n/a        | conditional forward                         |
| `events.addAbortListener`                 | 18.18 / 20.5 | yes        | yes        | polyfill                                    |
| `Symbol.asyncDispose`                     | 18.18 / 20.4 | yes        | yes        | feature-detect                              |
| `stream/consumers.bytes`                  | unverified   | yes        | yes        | feature-detect                              |
| `dns.resolveTlsa`                         | 22           | unverified | unverified | throw                                       |
| `zlib zstd family`                        | 22           | unverified | unverified | throw                                       |
| `zlib iterable compression`               | 24           | unverified | unverified | throw                                       |
| `zlib zip archive family`                 | 26           | unverified | unverified | throw                                       |
| `crypto.argon2, encapsulate, decapsulate` | 24           | unverified | unverified | throw                                       |
| `worker_threads.locks`                    | 24           | unverified | unverified | throw                                       |
| `net.BoundSocket`                         | 26.4         | unverified | unverified | feature-detect                              |
| `http.IncomingMessage.signal`             | 26           | unverified | unverified | feature-detect                              |
| `node:sqlite`                             | 22.5         | yes        | no         | dynamic import in try/catch                 |

<!-- generated:end -->

## Runtime behavioral quirks

- Numeric errno portability: numeric errno codes vary across platforms and alternative runtimes. Error code guards evaluate string error codes rather than numeric errno values.
- Unknown option keys on Deno: Deno rejects unknown option keys with invalid argument type errors on select methods. Signal forwarding is gated by function and version capability.
- Argument validation errors: programmer validation errors remain distinct from operational runtime failures.
- Error identity across runtimes: abort errors are matched by name rather than constructor instance checks or numeric codes.
- Deno permission error inspection: permission denials on Deno are matched through dedicated name guards.
