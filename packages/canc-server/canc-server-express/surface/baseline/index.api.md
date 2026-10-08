# Public surface: @cancjs/server-express .

Generated. Do not edit by hand.

- Declarations: `packages/canc-server/canc-server-express/dist/types/index.d.ts`
- Exports: 12

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

## `cancelErrorHandler` (function)

```text
(options?: ICancelErrorHandlerOptions | undefined): ErrorRequestHandler<ParamsDictionary, any, any, ParsedQs, Record<string, any>>
```

## `cancelMiddleware` (function)

```text
(options?: ICancelableHandlerOptions | undefined): RequestHandler<ParamsDictionary, any, any, ParsedQs, Record<string, any>>
```

## `cancelableHandler<P = ParamsDictionary, ResBody = any, ReqBody = any, ReqQuery = Query, Locals extends Record<string, any> = Record<string, any>>` (function)

```text
<P = ParamsDictionary, ResBody = any, ReqBody = any, ReqQuery = ParsedQs, Locals extends Record<string, any> = Record<string, any>>(handler: THandlerFn<RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals>>, options?: ICancelableHandlerOptions | undefined): RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals>
```

## `getRequestSignal` (function)

```text
(req: IncomingMessage, res: ServerResponse<IncomingMessage>): CancelSignal
```

## `shutdown` (function)

```text
(server: Server<typeof IncomingMessage, typeof ServerResponse>, options?: IShutdownOptions | undefined): Promise<IShutdownResult>
```
