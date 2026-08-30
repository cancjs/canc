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
| `sqlite`            | 6 exports   | 5 exports   | ✖ missing   |
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
| `fs.statfs`                               | 18.15        | ✅         | ✅         | feature-detect                              |
| `fs.glob`                                 | 22.0         | ✅         | ✅         | throw NotImplementedError on older versions |
| `fs.mkdtempDisposable`                    | 24.4         | ✅         | ✖          | feature-detect                              |
| `FileHandle.pull / writer`                | 25.9 (26+)   | ✖          | ✖          | feature-detect                              |
| `fs.stat / lstat signal`                  | 26.8         | n/a        | n/a        | conditional forward                         |
| `FileHandle.stat signal`                  | 26.1         | n/a        | n/a        | conditional forward                         |
| `events.addAbortListener`                 | 18.18 / 20.5 | ✅         | ✅         | polyfill                                    |
| `Symbol.asyncDispose`                     | 18.18 / 20.4 | ✅         | ✅         | feature-detect                              |
| `stream/consumers.bytes`                  | unverified   | ✅         | ✅         | feature-detect                              |
| `dns.resolveTlsa`                         | 22           | unverified | unverified | throw                                       |
| `zlib zstd family`                        | 22           | unverified | unverified | throw                                       |
| `zlib iterable compression`               | 24           | unverified | unverified | throw                                       |
| `zlib zip archive family`                 | 26           | unverified | unverified | throw                                       |
| `crypto.argon2, encapsulate, decapsulate` | 24           | unverified | unverified | throw                                       |
| `worker_threads.locks`                    | 24           | unverified | unverified | throw                                       |
| `net.BoundSocket`                         | 26.4         | unverified | unverified | feature-detect                              |
| `http.IncomingMessage.signal`             | 26           | unverified | unverified | feature-detect                              |
| `node:sqlite`                             | 22.5         | ✅         | ✖          | dynamic import in try/catch                 |

<!-- generated:end -->

## Runtime behavioral quirks

- Numeric errno portability: numeric errno codes vary across platforms and alternative runtimes. Error code guards evaluate string error codes rather than numeric errno values.
- Unknown option keys on Deno: Deno rejects unknown option keys with invalid argument type errors on select methods. Signal forwarding is gated by function and version capability.
- Argument validation errors: programmer validation errors remain distinct from operational runtime failures.
- Error identity across runtimes: abort errors are matched by name rather than constructor instance checks or numeric codes.
- Deno permission error inspection: permission denials on Deno are matched through dedicated name guards.
