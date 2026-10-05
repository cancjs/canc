# Public surface: @cancjs/node ./child-process

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/child-process/index.d.ts`
- Exports: 14

## `ChildProcess` (class)

```text
extends EventEmitter
new (options?: EventEmitterOptions | undefined): ChildProcess
```

## `ExecFileOptions` (interface)

```text
extends CommonOptions, Abortable
```

## `ExecOptions` (interface)

```text
extends CommonOptions
```

## `ForkOptions` (interface)

```text
extends ProcessEnvOptions, MessagingOptions, Abortable
```

## `IExecChildProcess<T extends string | Buffer = string>` (interface)

```text
extends ChildProcess
readonly promise: CancelablePromise<IExecResult<T>>
```

## `IExecResult<T extends string | Buffer = string>` (interface)

```text
stderr: T
stdout: T
```

## `IProcessChildProcess` (interface)

```text
extends ChildProcess
readonly promise: CancelablePromise<IProcessResult>
```

## `IProcessResult` (interface)

```text
exitCode: number | null
signal: NodeJS.Signals | null
```

## `SpawnOptions` (interface)

```text
extends CommonSpawnOptions
```

## `TExecPromise<T extends string | Buffer = string>` (type)

```text
any
```

## `exec` (function)

```text
(command: string, callback?: TExecCallback<string> | undefined): IExecChildProcess<string>
(command: string, options: ExecOptionsWithBufferEncoding, callback?: TExecCallback<Buffer<ArrayBufferLike>> | undefined): IExecChildProcess<Buffer<ArrayBufferLike>>
(command: string, options: ExecOptions | ExecOptionsWithStringEncoding, callback?: TExecCallback<string> | undefined): IExecChildProcess<string>
__promisify__: (command: string, options?: TExecOptions) => TExecPromise<string | Buffer>
```

## `execFile` (function)

```text
(file: string, callback?: TExecFileCallback<string> | undefined): IExecChildProcess<string>
(file: string, args: ReadonlyArray<string> | null | undefined, callback?: TExecFileCallback<string> | undefined): IExecChildProcess<string>
(file: string, options: ExecFileOptionsWithBufferEncoding, callback?: TExecFileCallback<Buffer<ArrayBufferLike>> | undefined): IExecChildProcess<Buffer<ArrayBufferLike>>
(file: string, options: ExecFileOptions | ExecFileOptionsWithStringEncoding, callback?: TExecFileCallback<string> | undefined): IExecChildProcess<string>
(file: string, args: ReadonlyArray<string> | null | undefined, options: ExecFileOptionsWithBufferEncoding, callback?: TExecFileCallback<Buffer<ArrayBufferLike>> | undefined): IExecChildProcess<Buffer<ArrayBufferLike>>
(file: string, args: ReadonlyArray<string> | null | undefined, options: ExecFileOptions | ExecFileOptionsWithStringEncoding, callback?: TExecFileCallback<string> | undefined): IExecChildProcess<string>
__promisify__: (file: string, args?: readonly string[] | null, options?: TExecFileOptions) => TExecPromise<string | Buffer>
```

## `fork` (function)

```text
(modulePath: string, options?: ForkOptions | undefined): IProcessChildProcess
(modulePath: string, args?: ReadonlyArray<string> | undefined, options?: ForkOptions | undefined): IProcessChildProcess
```

## `spawn` (function)

```text
(command: string, options?: SpawnOptions | undefined): IProcessChildProcess
(command: string, args?: ReadonlyArray<string> | undefined, options?: SpawnOptions | undefined): IProcessChildProcess
```
