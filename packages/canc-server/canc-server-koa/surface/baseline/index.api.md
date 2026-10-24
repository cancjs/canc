# Public surface: @cancjs/server-koa .

Generated. Do not edit by hand.

- Declarations: `packages/canc-server/canc-server-koa/dist/types/index.d.ts`
- Exports: 11

## `CLIENT_DISCONNECTED` (const)

```text
"client disconnected"
```

## `HANDLER_TIMEOUT` (const)

```text
"handler timeout"
```

## `ICancelErrorHandlerOptions` (interface)

```text
status?: number | undefined
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
cancelAfter?: number | undefined
closeAfter?: number | undefined
closeServer?: boolean | undefined
reason?: string | undefined
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
<StateT = DefaultState, ContextT = DefaultContext>(options?: (ICancelErrorHandlerOptions & ICancelableHandlerOptions) | undefined): Middleware<StateT, ContextT>
```

## `cancelableHandler<StateT = DefaultState, ContextT = DefaultContext, ResponseBodyT = unknown>` (function)

```text
<StateT = DefaultState, ContextT = DefaultContext, ResponseBodyT = unknown>(handler: THandlerFn<(ctx: ParameterizedContext<StateT, ContextT, ResponseBodyT>) => any>, options?: ICancelableHandlerOptions | undefined): (ctx: ParameterizedContext<StateT, ContextT, ResponseBodyT>) => Promise<void>
```

## `createShutdown` (function)

```text
(server: Server<typeof IncomingMessage, typeof ServerResponse>): (options?: IShutdownOptions | undefined) => Promise<IShutdownResult>
```

## `getRequestSignal` (function)

```text
(ctx: Context): CancelSignal
```
