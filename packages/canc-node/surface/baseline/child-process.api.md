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
readonly promise: CancelablePromise<IExecResult<T>, Unlisted>
```

## `IExecResult<T extends string | Buffer = string>` (interface)

```text
stderr: T
stdout: T
```

## `IProcessChildProcess` (interface)

```text
extends ChildProcess
readonly promise: CancelablePromise<IProcessResult, Unlisted>
```

## `IProcessResult` (interface)

```text
exitCode: null | number
signal: NodeJS.Signals | null
```

## `SpawnOptions` (interface)

```text
extends CommonSpawnOptions
```

## `TExecPromise<T extends string | Buffer = string>` (type)

```text
_abortListeners?: Map<IAbortSignal, any> | undefined
_abortSignals?: Array<IAbortSignal> | undefined
_addChainRef: (bubbleOnComplete?: boolean) => (() => void) | undefined
_boundCancel?: ((reason?: any, _disposing?: boolean) => CancelablePromise<ISettledResult<unknown>[], never> | void) | undefined
_cancel: (reason?: any, disposing?: boolean, collector?: any[]) => void
_cancelHandlers?: Array<TOnCancel> | undefined
_canceledReason: any
_chain: (childPromise: CancelablePromise<any, any>, bubbleOnComplete?: boolean) => void
_chainInput: (resultPromise: CancelablePromise<any, any>, bubbleOnComplete?: boolean) => void
_chainsCount: number
_collector?: Array<any> | undefined
_completedChainsCount: number
_dispose: () => CancelablePromise<ISettledResult<unknown>[], never> | void
_flags: number
_getBoundCancel: () => (reason?: any, _disposing?: boolean) => CancelablePromise<ISettledResult<unknown>[], never> | void
_internalState: TCancelablePromiseStates
_isCanceledReasonSet: boolean
_pendingSyncCancel: boolean
_pendingSyncCancelReason: any
_reject: (reason?: any) => void
_resolve: (value?: any) => void
_runCancellation: (reason?: any, collector?: any[]) => void
_runSettlementEffects: () => void
_setFlag: any
_subscribe: (onFulfilled?: ((value: IExecResult<T>) => any) | null | undefined, onRejected?: ((reason: any) => any) | null) => void
_then: <TResult1 = IExecResult<T>, TResult2 = never>(onFulfilled?: ((value: IExecResult<T>) => TResult1) | null | undefined, onRejected?: ((reason: any) => TResult2) | null | undefined) => CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? Unlisted : never) | FailureOf<TResult1> | FailureOf<TResult2>>
asyncCancel: boolean
bubble: boolean
cancel: (reason?: any, _disposing?: boolean) => CancelablePromise<ISettledResult<unknown>[], never> | void
cancelable: boolean
canceled: boolean
catch: { <R extends PromiseLike<never>>(onRejected: (reason: any) => R): CancelablePromise<Awaited<R> | IExecResult<T>, FailureOf<R>>; <R = never>(onRejected: (reason: any) => R): CancelablePromise<Awaited<R> | IExecResult<T>, FailureOf<R>>; <R = never>(onRejected?: ((reason: any) => R) | null | undefined): CancelablePromise<Awaited<R> | IExecResult<T>, FailureOf<R> | Unlisted>; }
child: IExecChildProcess<T>
finally: (onFinally?: (() => PromiseLike<unknown> | void) | null) => CancelablePromise<IExecResult<T>, Unlisted>
forceCancelable: boolean
handleCancel: (onCancel: TOnCancel, options?: IHandleCancelOptions) => CancelablePromise<IExecResult<T>, Unlisted>
isCancelable: boolean // @deprecated
isCanceled: boolean // @deprecated
options: Required<ICancelablePromiseFlagOptions>
readonly [CANCEL_PROMISE_BRAND]: true
readonly [FAILURE]?: Unlisted | undefined
readonly [toStringTag]: string
shield: boolean
strict: boolean
then: { <TResult1 extends PromiseLike<never>, TResult2 extends PromiseLike<never>>(onFulfilled: (value: IExecResult<T>) => TResult1, onRejected: (reason: any) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<never>, TResult2 = never>(onFulfilled: (value: IExecResult<T>) => TResult1, onRejected: (reason: any) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? Unlisted : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<never>, TResult2 = never>(onFulfilled: (value: IExecResult<T>) => TResult1, onRejected?: ((reason: any) => TResult2) | null | undefined): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2> | Unlisted>; <TResult1 = IExecResult<T>, TResult2 extends PromiseLike<never> = never>(onFulfilled: ((value: IExecResult<T>) => TResult1) | null | undefined, onRejected: (reason: any) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = IExecResult<T>, TResult2 = never>(onFulfilled: ((value: IExecResult<T>) => TResult1) | null | undefined, onRejected: (reason: any) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? Unlisted : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = IExecResult<T>, TResult2 = never>(onFulfilled?: ((value: IExecResult<T>) => TResult1) | null | undefined, onRejected?: ((reason: any) => TResult2) | null | undefined): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2> | Unlisted>; }
```

## `exec` (function)

```text
(command: string, callback?: TExecCallback<string> | undefined): IExecChildProcess<string>
(command: string, options: ExecOptionsWithBufferEncoding, callback?: TExecCallback<Buffer<ArrayBufferLike>> | undefined): IExecChildProcess<Buffer<ArrayBufferLike>>
(command: string, options: ExecOptions | ExecOptionsWithStringEncoding, callback?: TExecCallback<string> | undefined): IExecChildProcess<string>
__promisify__: (command: string, options?: TExecOptions) => TExecPromise<Buffer | string>
```

## `execFile` (function)

```text
(file: string, callback?: TExecFileCallback<string> | undefined): IExecChildProcess<string>
(file: string, args: ReadonlyArray<string> | null | undefined, callback?: TExecFileCallback<string> | undefined): IExecChildProcess<string>
(file: string, options: ExecFileOptionsWithBufferEncoding, callback?: TExecFileCallback<Buffer<ArrayBufferLike>> | undefined): IExecChildProcess<Buffer<ArrayBufferLike>>
(file: string, options: ExecFileOptions | ExecFileOptionsWithStringEncoding, callback?: TExecFileCallback<string> | undefined): IExecChildProcess<string>
(file: string, args: ReadonlyArray<string> | null | undefined, options: ExecFileOptionsWithBufferEncoding, callback?: TExecFileCallback<Buffer<ArrayBufferLike>> | undefined): IExecChildProcess<Buffer<ArrayBufferLike>>
(file: string, args: ReadonlyArray<string> | null | undefined, options: ExecFileOptions | ExecFileOptionsWithStringEncoding, callback?: TExecFileCallback<string> | undefined): IExecChildProcess<string>
__promisify__: (file: string, args?: null | readonly string[], options?: TExecFileOptions) => TExecPromise<Buffer | string>
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
