# Public surface: @cancjs/server-node .

Generated. Do not edit by hand.

- Declarations: `packages/canc-server/canc-server-node/dist/types/index.d.ts`
- Exports: 15

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

## `INodeCancelErrorHandlerOptions` (interface)

```text
extends ICancelErrorHandlerOptions
rethrow?: boolean | undefined
status?: number | undefined
```

## `INodeCancelableHandlerOptions<TReq extends IncomingMessage = IncomingMessage, TRes extends ServerResponse = ServerResponse>` (interface)

```text
extends ICancelableHandlerOptions
onDisconnect?: ((reason: CancelError) => void) | undefined
onError?: TNodeErrorHandler<TReq, TRes> | undefined
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

## `TNodeErrorHandler<TReq extends IncomingMessage = IncomingMessage, TRes extends ServerResponse = ServerResponse>` (type)

```text
(error: unknown, req: TReq, res: TRes): void
```

## `TNodeHandler<TReq extends IncomingMessage = IncomingMessage, TRes extends ServerResponse = ServerResponse>` (type)

```text
(req: TReq, res: TRes): unknown
```

## `cancelErrorHandler<TReq extends IncomingMessage = IncomingMessage, TRes extends ServerResponse = ServerResponse>` (function)

```text
<TReq extends IncomingMessage = IncomingMessage, TRes extends ServerResponse = ServerResponse<IncomingMessage>>(options?: INodeCancelErrorHandlerOptions | undefined): TNodeErrorHandler<TReq, TRes>
```

## `cancelableHandler<TReq extends IncomingMessage = IncomingMessage, TRes extends ServerResponse = ServerResponse>` (function)

```text
<TReq extends IncomingMessage = IncomingMessage, TRes extends ServerResponse = ServerResponse<IncomingMessage>>(handler: THandlerFn<TNodeHandler<TReq, TRes>>, options?: INodeCancelableHandlerOptions<TReq, TRes> | undefined): (req: TReq, res: TRes) => void
```

## `getRequestSignal` (function)

```text
(req: IncomingMessage, res: ServerResponse<IncomingMessage>): CancelSignal
```

## `shutdown` (function)

```text
(server: Server<typeof IncomingMessage, typeof ServerResponse>, options?: IShutdownOptions | undefined): Promise<IShutdownResult>
```
