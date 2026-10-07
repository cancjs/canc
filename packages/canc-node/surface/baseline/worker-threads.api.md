# Public surface: @cancjs/node ./worker-threads

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/worker-threads/index.d.ts`
- Exports: 20

## `BroadcastChannel` (class)

```text
extends NodeJS.RefCounted
new (name: string): BroadcastChannel
```

## `ILock` (interface)

```text
readonly mode: TLockMode
readonly name: string
```

## `ILockOptions` (interface)

```text
ifAvailable?: boolean | undefined
mode?: TLockMode | undefined
signal?: AbortSignal | undefined
steal?: boolean | undefined
```

## `IRequestLockFn` (interface)

```text
<T>(name: string, fn: TLockBody<T>): CancelablePromise<T, never>
<T>(name: string, options: ILockOptions, fn: TLockBody<T>): CancelablePromise<T, never>
```

## `IRunTaskOptions` (interface)

```text
extends Omit<WorkerOptions, 'workerData'>
gracePeriod?: number | undefined
terminate?: TTerminateMode | undefined
```

## `IWorkerConstructor` (interface)

```text
new (filename: string | URL, options?: WorkerOptions | undefined): IWorkerWithPromise
```

## `IWorkerWithPromise` (interface)

```text
extends NodeWorker
readonly promise: CancelablePromise<number, never>
```

## `MessageChannel` (class)

```text
new (): MessageChannel
```

## `MessagePort` (class)

```text
implements EventTarget
new (): MessagePort
```

## `STOP_MESSAGE` (const)

```text
"@cancjs/node:stop"
```

## `TLockBody<T>` (type)

```text
(lock: ILock | null): T | PromiseLike<T>
```

## `TLockMode` (type)

```text
"exclusive" | "shared"
```

## `TTerminateMode` (type)

```text
"graceful" | "immediate"
```

## `Worker` (const)

```text
new (filename: string | URL, options?: WorkerOptions | undefined): IWorkerWithPromise
```

## `isMainThread` (const)

```text
boolean
```

## `parentPort` (const)

```text
MessagePort | null
```

## `requestLock` (const)

```text
<T>(name: string, fn: TLockBody<T>): CancelablePromise<T, never>
<T>(name: string, options: ILockOptions, fn: TLockBody<T>): CancelablePromise<T, never>
```

## `runTask<TResult = unknown>` (function)

```text
<TResult = unknown>(script: string | URL, workerData?: unknown, options?: IRunTaskOptions | undefined): CancelablePromise<TResult, never>
```

## `threadId` (const)

```text
number
```

## `workerData` (const)

```text
any
```
