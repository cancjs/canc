# Public surface: @cancjs/server-fastify .

Generated. Do not edit by hand.

- Declarations: `packages/canc-server/canc-server-fastify/dist/types/index.d.ts`
- Exports: 21

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
onError?: ((error: unknown, request: FastifyRequest, reply: FastifyReply) => void) | undefined
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
headers?: Record<string, string> | undefined
reason?: string | undefined
status?: number | undefined
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

## `TCancelableHookFn<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>` (type)

```text
TGeneratorFn<(this: FastifyInstance, request: FastifyRequest<RouteGeneric>, reply: FastifyReply<RouteGeneric>) => unknown, unknown> | TPlainHandlerFn<(this: FastifyInstance, request: FastifyRequest<RouteGeneric>, reply: FastifyReply<RouteGeneric>) => unknown>
```

## `TCancelablePreParsingFn<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>` (type)

```text
TGeneratorFn<(this: FastifyInstance, request: FastifyRequest<RouteGeneric, RawServerDefault, IncomingMessage, FastifySchema, FastifyTypeProviderDefault, unknown, FastifyBaseLogger, ResolveFastifyRequestType<FastifyTypeProviderDefault, FastifySchema, RouteGeneric>>, reply: FastifyReply<RouteGeneric, RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, unknown, FastifySchema, FastifyTypeProviderDefault, UndefinedToUnknown<KeysOf<RouteGeneric["Reply"]> extends never ? never : RouteGeneric["Reply"]>>, payload: RequestPayload) => unknown, unknown> | TPlainHandlerFn<(this: FastifyInstance, request: FastifyRequest<RouteGeneric, RawServerDefault, IncomingMessage, FastifySchema, FastifyTypeProviderDefault, unknown, FastifyBaseLogger, ResolveFastifyRequestType<FastifyTypeProviderDefault, FastifySchema, RouteGeneric>>, reply: FastifyReply<RouteGeneric, RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, unknown, FastifySchema, FastifyTypeProviderDefault, UndefinedToUnknown<KeysOf<RouteGeneric["Reply"]> extends never ? never : RouteGeneric["Reply"]>>, payload: RequestPayload) => unknown>
```

## `TFastifyPreParsingHook<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>` (type)

```text
(this: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>, request: FastifyRequest<RouteGeneric, RawServerDefault, IncomingMessage, FastifySchema, FastifyTypeProviderDefault, unknown, FastifyBaseLogger, ResolveFastifyRequestType<FastifyTypeProviderDefault, FastifySchema, RouteGeneric>>, reply: FastifyReply<RouteGeneric, RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, unknown, FastifySchema, FastifyTypeProviderDefault, UndefinedToUnknown<KeysOf<RouteGeneric["Reply"]> extends never ? never : RouteGeneric["Reply"]>>, payload: RequestPayload): Promise<unknown>
```

## `TFastifyRequestHook<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>` (type)

```text
(this: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>, request: FastifyRequest<RouteGeneric, RawServerDefault, IncomingMessage, FastifySchema, FastifyTypeProviderDefault, unknown, FastifyBaseLogger, ResolveFastifyRequestType<FastifyTypeProviderDefault, FastifySchema, RouteGeneric>>, reply: FastifyReply<RouteGeneric, RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, unknown, FastifySchema, FastifyTypeProviderDefault, UndefinedToUnknown<KeysOf<RouteGeneric["Reply"]> extends never ? never : RouteGeneric["Reply"]>>): Promise<unknown>
```

## `TFastifyRouteHandler<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>` (type)

```text
(this: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>, request: FastifyRequest<RouteGeneric, RawServerDefault, IncomingMessage, FastifySchema, FastifyTypeProviderDefault, unknown, FastifyBaseLogger, ResolveFastifyRequestType<FastifyTypeProviderDefault, FastifySchema, RouteGeneric>>, reply: FastifyReply<RouteGeneric, RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, unknown, FastifySchema, FastifyTypeProviderDefault, UndefinedToUnknown<KeysOf<RouteGeneric["Reply"]> extends never ? never : RouteGeneric["Reply"]>>): ResolveFastifyReplyReturnType<FastifyTypeProviderDefault, FastifySchema, RouteGeneric>
```

## `TTimeoutOption` (type)

```text
number | { ms: number; status?: number; message?: string; headers?: Record<string, string>; }
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

## `cancelableHook<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>` (function)

```text
<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>(hook: TCancelableHookFn<RouteGeneric>, options?: ICancelableHandlerOptions | undefined): TFastifyRequestHook<RouteGeneric>
```

## `cancelablePreParsing<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>` (function)

```text
<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>(hook: TCancelablePreParsingFn<RouteGeneric>, options?: ICancelableHandlerOptions | undefined): TFastifyPreParsingHook<RouteGeneric>
```

## `createShutdown` (function)

```text
(app: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>, options?: IShutdownOptions | undefined): (options?: IShutdownOptions | undefined) => Promise<IShutdownResult>
```

## `getRequestSignal` (function)

```text
(request: Pick<FastifyRequest<RouteGenericInterface, RawServerDefault, IncomingMessage, FastifySchema, FastifyTypeProviderDefault, unknown, FastifyBaseLogger, ResolveFastifyRequestType<FastifyTypeProviderDefault, FastifySchema, RouteGenericInterface>>, "raw">, reply: Pick<FastifyReply<RouteGenericInterface, RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, unknown, FastifySchema, FastifyTypeProviderDefault, unknown>, "raw">): CancelSignal
```
