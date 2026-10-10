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
(stream: AsyncIterable<any> | NodeJS.ReadableStream | ReadableStream<any>, options?: IConsumerOptions | undefined): CancelablePromise<ArrayBuffer, never>
```

## `blob` (const)

```text
(stream: AsyncIterable<any> | NodeJS.ReadableStream | ReadableStream<any>, options?: IConsumerOptions | undefined): CancelablePromise<Blob, never>
```

## `buffer` (const)

```text
(stream: AsyncIterable<any> | NodeJS.ReadableStream | ReadableStream<any>, options?: IConsumerOptions | undefined): CancelablePromise<NonSharedBuffer, never>
```

## `bytes` (const)

```text
(stream: AsyncIterable<any> | NodeJS.ReadableStream | ReadableStream<any>, options?: IConsumerOptions | undefined): CancelablePromise<Uint8Array<ArrayBufferLike>, never>
```

## `duplexPair` (function)

```text
(options?: DuplexOptions<Duplex> | undefined): [Duplex, Duplex]
```

## `every<T = unknown>` (function)

```text
<T = unknown>(stream: Readable, fn: (data: T, options: IReadableVisitorOptions) => Promise<boolean> | boolean, options?: IReadableTerminalOptions | undefined): CancelablePromise<boolean, never>
```

## `find<T = unknown>` (function)

```text
<T = unknown>(stream: Readable, fn: (data: T, options: IReadableVisitorOptions) => Promise<boolean> | boolean, options?: IReadableTerminalOptions | undefined): CancelablePromise<T | undefined, never>
```

## `finished` (const)

```text
(stream: ReadWriteStream | ReadableStream | WritableStream, options?: FinishedOptions | undefined): CancelablePromise<void, never>
```

## `forEach<T = unknown>` (function)

```text
<T = unknown>(stream: Readable, fn: (data: T, options: IReadableVisitorOptions) => Promise<void> | void, options?: IReadableTerminalOptions | undefined): CancelablePromise<void, never>
```

## `json` (const)

```text
(stream: AsyncIterable<any> | NodeJS.ReadableStream | ReadableStream<any>, options?: IConsumerOptions | undefined): CancelablePromise<unknown, never>
```

## `pipeline` (const)

```text
(source: PipelineSource<any>, destination: PipelineDestinationIterableFunction<Buffer<ArrayBufferLike> | string> | PipelineDestinationIterableFunction<any> | PipelineDestinationPromiseFunction<Buffer<ArrayBufferLike> | string, any> | PipelineDestinationPromiseFunction<any, any> | WritableStream, options?: PipelineOptions | undefined): CancelablePromise<any, never>
(source: PipelineSource<any>, transform1: PipelineTransform<PipelineSource<any>, any>, destination: PipelineDestinationIterableFunction<Buffer<ArrayBufferLike> | string> | PipelineDestinationIterableFunction<any> | PipelineDestinationPromiseFunction<Buffer<ArrayBufferLike> | string, any> | PipelineDestinationPromiseFunction<any, any> | WritableStream, options?: PipelineOptions | undefined): CancelablePromise<any, never>
(source: PipelineSource<any>, transform1: PipelineTransform<PipelineSource<any>, any>, transform2: PipelineTransform<PipelineTransform<PipelineSource<any>, any>, any>, destination: PipelineDestinationIterableFunction<Buffer<ArrayBufferLike> | string> | PipelineDestinationIterableFunction<any> | PipelineDestinationPromiseFunction<Buffer<ArrayBufferLike> | string, any> | PipelineDestinationPromiseFunction<any, any> | WritableStream, options?: PipelineOptions | undefined): CancelablePromise<any, never>
(source: PipelineSource<any>, transform1: PipelineTransform<PipelineSource<any>, any>, transform2: PipelineTransform<PipelineTransform<PipelineSource<any>, any>, any>, transform3: PipelineTransform<PipelineTransform<PipelineTransform<PipelineSource<any>, any>, any>, any>, destination: PipelineDestinationIterableFunction<Buffer<ArrayBufferLike> | string> | PipelineDestinationIterableFunction<any> | PipelineDestinationPromiseFunction<Buffer<ArrayBufferLike> | string, any> | PipelineDestinationPromiseFunction<any, any> | WritableStream, options?: PipelineOptions | undefined): CancelablePromise<any, never>
(source: PipelineSource<any>, transform1: PipelineTransform<PipelineSource<any>, any>, transform2: PipelineTransform<PipelineTransform<PipelineSource<any>, any>, any>, transform3: PipelineTransform<PipelineTransform<PipelineTransform<PipelineSource<any>, any>, any>, any>, transform4: PipelineTransform<PipelineTransform<PipelineTransform<PipelineTransform<PipelineSource<any>, any>, any>, any>, any>, destination: PipelineDestinationIterableFunction<Buffer<ArrayBufferLike> | string> | PipelineDestinationIterableFunction<any> | PipelineDestinationPromiseFunction<Buffer<ArrayBufferLike> | string, any> | PipelineDestinationPromiseFunction<any, any> | WritableStream, options?: PipelineOptions | undefined): CancelablePromise<any, never>
(streams: ReadonlyArray<ReadWriteStream | ReadableStream | WritableStream>, options?: PipelineOptions | undefined): CancelablePromise<void, never>
(stream1: ReadableStream, stream2: ReadWriteStream | WritableStream, ...streams: Array<PipelineOptions | ReadWriteStream | WritableStream>): CancelablePromise<void, never>
```

## `reduce<T = unknown, TAcc = T>` (function)

```text
<T = unknown, TAcc = T>(stream: Readable, fn: (previous: TAcc, data: T, options: IReadableVisitorOptions) => Promise<TAcc> | TAcc, initial?: TAcc | undefined, options?: Pick<IReadableTerminalOptions, "signal"> | undefined): CancelablePromise<TAcc, never>
```

## `some<T = unknown>` (function)

```text
<T = unknown>(stream: Readable, fn: (data: T, options: IReadableVisitorOptions) => Promise<boolean> | boolean, options?: IReadableTerminalOptions | undefined): CancelablePromise<boolean, never>
```

## `text` (const)

```text
(stream: AsyncIterable<any> | NodeJS.ReadableStream | ReadableStream<any>, options?: IConsumerOptions | undefined): CancelablePromise<string, never>
```

## `toArray<T = unknown>` (function)

```text
<T = unknown>(stream: Readable, options?: Pick<IReadableTerminalOptions, "signal"> | undefined): CancelablePromise<Array<T>, never>
```
