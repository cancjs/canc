# Public surface: @cancjs/node ./stream

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/stream/index.d.ts`
- Exports: 24

## `Duplex` (class)

```text
extends Stream
implements NodeJS.ReadWriteStream
new (opts?: DuplexOptions<Duplex> | undefined): Duplex
```

## `IConsumerOptions` (interface)

```text
destroyOnCancel?: boolean | undefined
```

## `IReadableTerminalOptions` (interface)

```text
concurrency?: number | undefined
signal?: AbortSignal | undefined
```

## `IReadableVisitorOptions` (interface)

```text
readonly signal: AbortSignal
```

## `PassThrough` (class)

```text
extends Transform
new (opts?: TransformOptions<Transform> | undefined): PassThrough
```

## `Readable` (class)

```text
extends Stream
implements NodeJS.ReadableStream
new (opts?: ReadableOptions<Readable> | undefined): Readable
```

## `Transform` (class)

```text
extends Duplex
new (opts?: TransformOptions<Transform> | undefined): Transform
```

## `Writable` (class)

```text
extends Stream
implements NodeJS.WritableStream
new (opts?: WritableOptions<Writable> | undefined): Writable
```

## `addAbortSignal<T extends Stream>` (function)

```text
<T extends Stream>(signal: AbortSignal, stream: T): T
```

## `arrayBuffer` (const)

```text
(stream: NodeJS.ReadableStream | AsyncIterable<any> | ReadableStream<any>, options?: IConsumerOptions | undefined): CancelablePromise<ArrayBuffer>
```

## `blob` (const)

```text
(stream: NodeJS.ReadableStream | AsyncIterable<any> | ReadableStream<any>, options?: IConsumerOptions | undefined): CancelablePromise<Blob>
```

## `buffer` (const)

```text
(stream: NodeJS.ReadableStream | AsyncIterable<any> | ReadableStream<any>, options?: IConsumerOptions | undefined): CancelablePromise<NonSharedBuffer>
```

## `bytes` (const)

```text
(stream: NodeJS.ReadableStream | AsyncIterable<any> | ReadableStream<any>, options?: IConsumerOptions | undefined): CancelablePromise<Uint8Array<ArrayBufferLike>>
```

## `duplexPair` (function)

```text
(options?: DuplexOptions<Duplex> | undefined): [Duplex, Duplex]
```

## `every<T = unknown>` (function)

```text
<T = unknown>(stream: Readable, fn: (data: T, options: IReadableVisitorOptions) => boolean | Promise<boolean>, options?: IReadableTerminalOptions | undefined): CancelablePromise<boolean>
```

## `find<T = unknown>` (function)

```text
<T = unknown>(stream: Readable, fn: (data: T, options: IReadableVisitorOptions) => boolean | Promise<boolean>, options?: IReadableTerminalOptions | undefined): CancelablePromise<T | undefined>
```

## `finished` (const)

```text
(stream: ReadableStream | WritableStream | ReadWriteStream, options?: FinishedOptions | undefined): CancelablePromise<void>
```

## `forEach<T = unknown>` (function)

```text
<T = unknown>(stream: Readable, fn: (data: T, options: IReadableVisitorOptions) => void | Promise<void>, options?: IReadableTerminalOptions | undefined): CancelablePromise<void>
```

## `json` (const)

```text
(stream: NodeJS.ReadableStream | AsyncIterable<any> | ReadableStream<any>, options?: IConsumerOptions | undefined): CancelablePromise<unknown>
```

## `pipeline` (const)

```text
(source: PipelineSource<any>, destination: WritableStream | PipelineDestinationIterableFunction<string | Buffer<ArrayBufferLike>> | PipelineDestinationPromiseFunction<string | Buffer<ArrayBufferLike>, any> | PipelineDestinationIterableFunction<any> | PipelineDestinationPromiseFunction<any, any>, options?: PipelineOptions | undefined): CancelablePromise<any>
(source: PipelineSource<any>, transform1: PipelineTransform<PipelineSource<any>, any>, destination: WritableStream | PipelineDestinationIterableFunction<string | Buffer<ArrayBufferLike>> | PipelineDestinationPromiseFunction<string | Buffer<ArrayBufferLike>, any> | PipelineDestinationIterableFunction<any> | PipelineDestinationPromiseFunction<any, any>, options?: PipelineOptions | undefined): CancelablePromise<any>
(source: PipelineSource<any>, transform1: PipelineTransform<PipelineSource<any>, any>, transform2: PipelineTransform<PipelineTransform<PipelineSource<any>, any>, any>, destination: WritableStream | PipelineDestinationIterableFunction<string | Buffer<ArrayBufferLike>> | PipelineDestinationPromiseFunction<string | Buffer<ArrayBufferLike>, any> | PipelineDestinationIterableFunction<any> | PipelineDestinationPromiseFunction<any, any>, options?: PipelineOptions | undefined): CancelablePromise<any>
(source: PipelineSource<any>, transform1: PipelineTransform<PipelineSource<any>, any>, transform2: PipelineTransform<PipelineTransform<PipelineSource<any>, any>, any>, transform3: PipelineTransform<PipelineTransform<PipelineTransform<PipelineSource<any>, any>, any>, any>, destination: WritableStream | PipelineDestinationIterableFunction<string | Buffer<ArrayBufferLike>> | PipelineDestinationPromiseFunction<string | Buffer<ArrayBufferLike>, any> | PipelineDestinationIterableFunction<any> | PipelineDestinationPromiseFunction<any, any>, options?: PipelineOptions | undefined): CancelablePromise<any>
(source: PipelineSource<any>, transform1: PipelineTransform<PipelineSource<any>, any>, transform2: PipelineTransform<PipelineTransform<PipelineSource<any>, any>, any>, transform3: PipelineTransform<PipelineTransform<PipelineTransform<PipelineSource<any>, any>, any>, any>, transform4: PipelineTransform<PipelineTransform<PipelineTransform<PipelineTransform<PipelineSource<any>, any>, any>, any>, any>, destination: WritableStream | PipelineDestinationIterableFunction<string | Buffer<ArrayBufferLike>> | PipelineDestinationPromiseFunction<string | Buffer<ArrayBufferLike>, any> | PipelineDestinationIterableFunction<any> | PipelineDestinationPromiseFunction<any, any>, options?: PipelineOptions | undefined): CancelablePromise<any>
(streams: ReadonlyArray<ReadableStream | WritableStream | ReadWriteStream>, options?: PipelineOptions | undefined): CancelablePromise<void>
(stream1: ReadableStream, stream2: WritableStream | ReadWriteStream, ...streams: Array<WritableStream | ReadWriteStream | PipelineOptions>): CancelablePromise<void>
```

## `reduce<T = unknown, TAcc = T>` (function)

```text
<T = unknown, TAcc = T>(stream: Readable, fn: (previous: TAcc, data: T, options: IReadableVisitorOptions) => TAcc | Promise<TAcc>, initial?: TAcc | undefined, options?: Pick<IReadableTerminalOptions, "signal"> | undefined): CancelablePromise<TAcc>
```

## `some<T = unknown>` (function)

```text
<T = unknown>(stream: Readable, fn: (data: T, options: IReadableVisitorOptions) => boolean | Promise<boolean>, options?: IReadableTerminalOptions | undefined): CancelablePromise<boolean>
```

## `text` (const)

```text
(stream: NodeJS.ReadableStream | AsyncIterable<any> | ReadableStream<any>, options?: IConsumerOptions | undefined): CancelablePromise<string>
```

## `toArray<T = unknown>` (function)

```text
<T = unknown>(stream: Readable, options?: Pick<IReadableTerminalOptions, "signal"> | undefined): CancelablePromise<Array<T>>
```
