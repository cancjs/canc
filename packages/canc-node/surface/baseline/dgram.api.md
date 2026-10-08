# Public surface: @cancjs/node ./dgram

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/dgram/index.d.ts`
- Exports: 9

## `DgramSocket` (class)

```text
extends EventEmitter
new (options?: EventEmitterOptions | undefined): Socket
```

## `RemoteInfo` (interface)

```text
address: string
family: "IPv4" | "IPv6"
port: number
size: number
```

## `SocketOptions` (interface)

```text
extends Abortable
```

## `SocketType` (type)

```text
"udp4" | "udp6"
```

## `bind` (function)

```text
(socket: Socket, port?: number | undefined, addr?: string | undefined): CancelablePromise<void, never>
```

## `connect` (function)

```text
(socket: Socket, port: number, addr?: string | undefined): CancelablePromise<void, never>
```

## `createSocket` (function)

```text
(type: SocketType, callback?: ((msg: Buffer<ArrayBufferLike>, rinfo: any) => void) | undefined): Socket
(options: any, callback?: ((msg: Buffer<ArrayBufferLike>, rinfo: any) => void) | undefined): Socket
```

## `nodeCreateSocket` (function)

```text
(type: SocketType, callback?: ((msg: NonSharedBuffer, rinfo: RemoteInfo) => void) | undefined): Socket
(options: SocketOptions, callback?: ((msg: NonSharedBuffer, rinfo: RemoteInfo) => void) | undefined): Socket
```

## `send` (function)

```text
(socket: Socket, msg: string | Uint8Array<ArrayBufferLike>, offset: number, length: number, port: number, addr?: string | undefined): CancelablePromise<number, never>
(socket: Socket, msg: string | Uint8Array<ArrayBufferLike>, port: number, addr?: string | undefined): CancelablePromise<number, never>
```
