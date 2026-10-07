# Public surface: @cancjs/server-hono .

Generated. Do not edit by hand.

- Declarations: `packages/canc-server/canc-server-hono/dist/types/index.d.ts`
- Exports: 16

## `CLIENT_CLOSED_STATUS` (const)

```text
499
```

## `CLIENT_DISCONNECTED` (const)

```text
"client disconnected"
```

## `HANDLER_TIMEOUT` (const)

```text
"handler timeout"
```

## `ICancelContext` (interface)

```text
env: unknown
req: { raw: Request; }
```

## `ICancelErrorHandlerOptions<E extends Env = any>` (interface)

```text
onError?: ErrorHandler<E> | undefined
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

## `THonoHandler<E extends Env = any, P extends string = any, I extends Input = TBlankInput>` (type)

```text
(c: Context<E, P, I>, next: Next): THonoResponse | Promise<THonoResponse>
```

## `TTimeoutOption` (type)

```text
number | { ms: number; status?: number; message?: string; }
```

## `cancelErrorHandler<E extends Env = any>` (function)

```text
<E extends Env = any>(options?: ICancelErrorHandlerOptions<E> | undefined): ErrorHandler<E>
```

## `cancelMiddleware<E extends Env = any>` (function)

```text
<E extends Env = any>(options?: ICancelableHandlerOptions | undefined): MiddlewareHandler<E>
```

## `cancelableHandler<E extends Env = any, P extends string = any, I extends Input = TBlankInput>` (function)

```text
<E extends Env = any, P extends string = any, I extends Input = TBlankInput>(handler: THandlerFn<THonoHandler<E, P, I>, Response>, options?: ICancelableHandlerOptions | undefined): Handler<E, P, I, Promise<Response>>
```

## `getRequestSignal` (function)

```text
(c: ICancelContext): CancelSignal
```

## `shutdown` (function)

```text
(server: IServerLike, options?: IShutdownOptions | undefined): Promise<IShutdownResult>
```
