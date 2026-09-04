# Public surface: @cancjs/node .

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/index.d.ts`
- Exports: 76

## `EACCES` (type)

```text
readonly code: "EACCES"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EADDRINUSE` (type)

```text
readonly code: "EADDRINUSE"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EADDRNOTAVAIL` (type)

```text
readonly code: "EADDRNOTAVAIL"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EAGAIN` (type)

```text
readonly code: "EAGAIN"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EBADNAME` (type)

```text
readonly code: "EBADNAME"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EBUSY` (type)

```text
readonly code: "EBUSY"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ECANCELLED` (type)

```text
readonly code: "ECANCELLED"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ECONNREFUSED` (type)

```text
readonly code: "ECONNREFUSED"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ECONNRESET` (type)

```text
readonly code: "ECONNRESET"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EDQUOT` (type)

```text
readonly code: "EDQUOT"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EEXIST` (type)

```text
readonly code: "EEXIST"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EFORMERR` (type)

```text
readonly code: "EFORMERR"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EHOSTUNREACH` (type)

```text
readonly code: "EHOSTUNREACH"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EINVAL` (type)

```text
readonly code: "EINVAL"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EIO` (type)

```text
readonly code: "EIO"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EISDIR` (type)

```text
readonly code: "EISDIR"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ELOOP` (type)

```text
readonly code: "ELOOP"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EMFILE` (type)

```text
readonly code: "EMFILE"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EMSGSIZE` (type)

```text
readonly code: "EMSGSIZE"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ENAMETOOLONG` (type)

```text
readonly code: "ENAMETOOLONG"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ENETUNREACH` (type)

```text
readonly code: "ENETUNREACH"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ENFILE` (type)

```text
readonly code: "ENFILE"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ENODATA` (type)

```text
readonly code: "ENODATA"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ENOENT` (type)

```text
readonly code: "ENOENT"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ENOSPC` (type)

```text
readonly code: "ENOSPC"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ENOTDIR` (type)

```text
readonly code: "ENOTDIR"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ENOTEMPTY` (type)

```text
readonly code: "ENOTEMPTY"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ENOTFOUND` (type)

```text
readonly code: "ENOTFOUND"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EPERM` (type)

```text
readonly code: "EPERM"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EPIPE` (type)

```text
readonly code: "EPIPE"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EREFUSED` (type)

```text
readonly code: "EREFUSED"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EROFS` (type)

```text
readonly code: "EROFS"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ESERVFAIL` (type)

```text
readonly code: "ESERVFAIL"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `ETIMEDOUT` (type)

```text
readonly code: "ETIMEDOUT"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `EXDEV` (type)

```text
readonly code: "EXDEV"
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `IJsonParseErrorOptions` (interface)

```text
cause?: unknown
path?: string | undefined
```

## `INotImplementedErrorOptions` (interface)

```text
cause?: unknown
feature?: string | undefined
required?: string | undefined
```

## `IProcessExitErrorOptions` (interface)

```text
cause?: unknown
command?: string | undefined
exitCode?: number | null | undefined
signal?: string | null | undefined
stderr?: string | Buffer<ArrayBufferLike> | undefined
stdout?: string | Buffer<ArrayBufferLike> | undefined
```

## `IProcessIpcErrorOptions` (interface)

```text
cause?: unknown
```

## `IProcessMaxBufferErrorOptions` (interface)

```text
cause?: unknown
command?: string | undefined
```

## `IProcessSignalErrorOptions` (interface)

```text
cause?: unknown
command?: string | undefined
signal?: string | null | undefined
```

## `IProcessSpawnErrorOptions` (interface)

```text
cause?: unknown
code?: string | undefined
command?: string | undefined
```

## `JSON_PARSE_ERROR_BRAND` (const)

```text
[toPrimitive]: (hint: string) => symbol
readonly [toStringTag]: string
readonly description: string | undefined
toString: () => string
valueOf: () => symbol
```

## `JsonParseError` (class)

```text
extends BaseJsonParseError
new (message?: string | undefined, options?: Error | IJsonParseErrorOptions | undefined): JsonParseError
readonly cause?: unknown
message: string
name: string
readonly path?: string | undefined
```

## `NOT_IMPLEMENTED_ERROR_BRAND` (const)

```text
[toPrimitive]: (hint: string) => symbol
readonly [toStringTag]: string
readonly description: string | undefined
toString: () => string
valueOf: () => symbol
```

## `NodeErrnoError<TCode extends string = string>` (interface)

```text
extends Error
readonly code: TCode
readonly errno?: number | undefined
readonly path?: string | undefined
readonly syscall?: string | undefined
```

## `NotImplementedError` (class)

```text
extends BaseNotImplementedError
new (message?: string | undefined, options?: INotImplementedErrorOptions | undefined): NotImplementedError
readonly cause?: unknown
readonly feature?: string | undefined
message: string
name: string
readonly required?: string | undefined
```

## `PROCESS_EXIT_ERROR_BRAND` (const)

```text
[toPrimitive]: (hint: string) => symbol
readonly [toStringTag]: string
readonly description: string | undefined
toString: () => string
valueOf: () => symbol
```

## `PROCESS_IPC_ERROR_BRAND` (const)

```text
[toPrimitive]: (hint: string) => symbol
readonly [toStringTag]: string
readonly description: string | undefined
toString: () => string
valueOf: () => symbol
```

## `PROCESS_MAX_BUFFER_ERROR_BRAND` (const)

```text
[toPrimitive]: (hint: string) => symbol
readonly [toStringTag]: string
readonly description: string | undefined
toString: () => string
valueOf: () => symbol
```

## `PROCESS_SIGNAL_ERROR_BRAND` (const)

```text
[toPrimitive]: (hint: string) => symbol
readonly [toStringTag]: string
readonly description: string | undefined
toString: () => string
valueOf: () => symbol
```

## `PROCESS_SPAWN_ERROR_BRAND` (const)

```text
[toPrimitive]: (hint: string) => symbol
readonly [toStringTag]: string
readonly description: string | undefined
toString: () => string
valueOf: () => symbol
```

## `ProcessExitError` (class)

```text
extends BaseProcessExitError
new (message?: string | undefined, options?: IProcessExitErrorOptions | undefined): ProcessExitError
readonly cause?: unknown
readonly command?: string | undefined
readonly exitCode?: number | null | undefined
message: string
name: string
readonly signal?: string | null | undefined
readonly stderr?: string | Buffer<ArrayBufferLike> | undefined
readonly stdout?: string | Buffer<ArrayBufferLike> | undefined
```

## `ProcessIpcError` (class)

```text
extends BaseProcessIpcError
new (message?: string | undefined, options?: IProcessIpcErrorOptions | undefined): ProcessIpcError
readonly cause?: unknown
message: string
name: string
```

## `ProcessMaxBufferError` (class)

```text
extends BaseProcessMaxBufferError
new (message?: string | undefined, options?: IProcessMaxBufferErrorOptions | undefined): ProcessMaxBufferError
readonly cause?: unknown
readonly command?: string | undefined
message: string
name: string
```

## `ProcessSignalError` (class)

```text
extends BaseProcessSignalError
new (message?: string | undefined, options?: IProcessSignalErrorOptions | undefined): ProcessSignalError
readonly cause?: unknown
readonly command?: string | undefined
message: string
name: string
readonly signal?: string | null | undefined
```

## `ProcessSpawnError` (class)

```text
extends BaseProcessSpawnError
new (message?: string | undefined, options?: IProcessSpawnErrorOptions | undefined): ProcessSpawnError
readonly cause?: unknown
readonly code?: string | undefined
readonly command?: string | undefined
message: string
name: string
```

## `features` (const)

```text
hasAddAbortListener: boolean
hasAsyncDispose: boolean
hasConsumersBytes: boolean
hasGlob: boolean
hasMkdtempDisposable: boolean
hasSqlite: boolean
hasStatfs: boolean
hasWorkerLocks: boolean
nodeMajor: number
nodeVersion: string
```

## `isBusyError` (const)

```text
(error: unknown): error is EBUSY | EAGAIN
```

## `isCrossDeviceError` (const)

```text
(error: unknown): error is NodeErrnoError<"EXDEV">
```

## `isErrno` (const)

```text
<TCode extends string>(code: TCode): (error: unknown) => error is NodeErrnoError<TCode>
```

## `isExistsError` (const)

```text
(error: unknown): error is NodeErrnoError<"EEXIST">
```

## `isIsDirError` (const)

```text
(error: unknown): error is NodeErrnoError<"EISDIR">
```

## `isJsonParseError` (const)

```text
(error: unknown): error is JsonParseError
```

## `isNoSpaceError` (const)

```text
(error: unknown): error is ENOSPC | EDQUOT
```

## `isNotDirError` (const)

```text
(error: unknown): error is NodeErrnoError<"ENOTDIR">
```

## `isNotEmptyError` (const)

```text
(error: unknown): error is NodeErrnoError<"ENOTEMPTY">
```

## `isNotFoundError` (const)

```text
(error: unknown): error is NodeErrnoError<"ENOENT">
```

## `isNotImplementedError` (const)

```text
(error: unknown): error is NotImplementedError
```

## `isPermissionError` (const)

```text
(error: unknown): error is EACCES | EPERM | EROFS | { name: "NotCapable"; }
```

## `isProcessExitError` (const)

```text
(error: unknown): error is ProcessExitError
```

## `isProcessIpcError` (const)

```text
(error: unknown): error is ProcessIpcError
```

## `isProcessMaxBufferError` (const)

```text
(error: unknown): error is ProcessMaxBufferError
```

## `isProcessSignalError` (const)

```text
(error: unknown): error is ProcessSignalError
```

## `isProcessSpawnError` (const)

```text
(error: unknown): error is ProcessSpawnError
```

## `isTooManyFilesError` (const)

```text
(error: unknown): error is EMFILE | ENFILE
```
