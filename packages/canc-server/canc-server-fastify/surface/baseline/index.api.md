# Public surface: @cancjs/server-fastify .

Generated. Do not edit by hand.

- Declarations: `packages/canc-server/canc-server-fastify/dist/types/index.d.ts`
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
canceledStatus?: number | undefined
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

## `TCancelErrorHandler` (type)

```text
(this: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>, error: unknown, request: FastifyRequest<RouteGenericInterface, RawServerDefault, IncomingMessage, FastifySchema, FastifyTypeProviderDefault, unknown, FastifyBaseLogger, ResolveFastifyRequestType<FastifyTypeProviderDefault, FastifySchema, RouteGenericInterface>>, reply: FastifyReply<RouteGenericInterface, RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, unknown, FastifySchema, FastifyTypeProviderDefault, unknown>): void
```

## `TFastifyRouteHandler<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>` (type)

```text
(this: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>, request: FastifyRequest<RouteGeneric, RawServerDefault, IncomingMessage, FastifySchema, FastifyTypeProviderDefault, unknown, FastifyBaseLogger, ResolveFastifyRequestType<FastifyTypeProviderDefault, FastifySchema, RouteGeneric>>, reply: FastifyReply<RouteGeneric, RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, unknown, FastifySchema, FastifyTypeProviderDefault, UndefinedToUnknown<KeysOf<RouteGeneric["Reply"]> extends never ? never : RouteGeneric["Reply"]>>): ResolveFastifyReplyReturnType<FastifyTypeProviderDefault, FastifySchema, RouteGeneric>
```

## `TTimeoutOption` (type)

```text
number | { ms: number; status?: number; message?: string; }
```

## `cancelErrorHandler` (function)

```text
(options?: ICancelErrorHandlerOptions | undefined): TCancelErrorHandler
```

## `cancelPlugin` (const)

```text
(instance: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>, opts: ICancelableHandlerOptions): Promise<void>
```

## `cancelableHandler<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>` (function)

```text
<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>(handler: THandlerFn<TFastifyRouteHandler<RouteGeneric>, RouteGeneric["Reply"]>, options?: ICancelableHandlerOptions | undefined): TFastifyRouteHandler<RouteGeneric>
```

## `getRequestSignal` (function)

```text
(request: Pick<FastifyRequest<RouteGenericInterface, RawServerDefault, IncomingMessage, FastifySchema, FastifyTypeProviderDefault, unknown, FastifyBaseLogger, ResolveFastifyRequestType<FastifyTypeProviderDefault, FastifySchema, RouteGenericInterface>>, "raw">, reply: Pick<FastifyReply<RouteGenericInterface, RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, unknown, FastifySchema, FastifyTypeProviderDefault, unknown>, "raw">): CancelSignal
```

## `shutdown` (function)

```text
(app: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>, options?: IShutdownOptions | undefined): Promise<IShutdownResult>
```
