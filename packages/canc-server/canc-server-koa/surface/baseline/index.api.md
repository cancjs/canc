# Public surface: @cancjs/server-koa .

Generated. Do not edit by hand.

- Declarations: `packages/canc-server/canc-server-koa/dist/types/index.d.ts`
- Exports: 10

## `CLIENT_DISCONNECTED` (const)

```text
"client disconnected"
```

## `HANDLER_TIMEOUT` (const)

```text
"handler timeout"
```

## `ICancelableHandlerOptions` (interface)

```text
extends ICancelablePromiseFlagOptions
onDisconnect?: ((reason: CancelError) => void) | undefined
onTimeout?: ((reason: CancelError) => void) | undefined
signal?: AbortSignal | Array<AbortSignal> | undefined
timeout?: TTimeoutOption | undefined
```

## `IShutdownOptions` (interface)

```text
closeServer?: boolean | undefined
reason?: string | undefined
timeout?: number | undefined
```

## `IShutdownResult` (interface)

```text
canceled: number
completed: number
timedOut: boolean
```

## `SERVER_SHUTDOWN` (const)

```text
"server shutdown"
```

## `cancelMiddleware<StateT = DefaultState, ContextT = DefaultContext>` (function)

```text
<StateT = DefaultState, ContextT = DefaultContext>(options?: ICancelableHandlerOptions | undefined): Middleware<StateT, ContextT>
```

## `cancelableHandler<StateT = DefaultState, ContextT = DefaultContext, ResponseBodyT = unknown>` (function)

```text
<StateT = DefaultState, ContextT = DefaultContext, ResponseBodyT = unknown>(handler: THandlerFn<(ctx: ParameterizedContext<StateT, ContextT, ResponseBodyT>) => any>, options?: ICancelableHandlerOptions | undefined): (ctx: ParameterizedContext<StateT, ContextT, ResponseBodyT>) => Promise<void>
```

## `getRequestSignal` (function)

```text
(ctx: Context): CancelSignal
```

## `shutdown` (function)

```text
(server: Server<typeof IncomingMessage, typeof ServerResponse>, options?: IShutdownOptions | undefined): Promise<IShutdownResult>
```
