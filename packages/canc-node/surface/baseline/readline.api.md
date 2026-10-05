# Public surface: @cancjs/node ./readline

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/readline/index.d.ts`
- Exports: 5

## `Completer` (type)

```text
(line: string): CompleterResult | Promise<CompleterResult>
```

## `Interface` (interface)

```text
extends Omit<NodeInterface, 'question'>
question: { (query: string): CancelablePromise<TValue extends FileHandle ? TCancelableFileHandle<TValue> : TValue>; (query: string): CancelablePromise<TValue extends FileHandle ? TCancelableFileHandle<TValue> : TValue>; (query: string): CancelablePromise<TValue extends FileHandle ? TCancelableFileHandle<TValue> : TValue>; (query: string): CancelablePromise<TValue extends FileHandle ? TCancelableFileHandle<TValue> : TValue>; (query: string): CancelablePromise<TValue extends FileHandle ? TCancelableFileHandle<TValue> : TValue>; (query: string, options: EventEmitter.Abortable): CancelablePromise<TValue extends FileHandle ? TCancelableFileHandle<TValue> : TValue>; }
```

## `ReadLineOptions` (interface)

```text
extends Omit<_ReadLineOptions, "completer">
```

## `Readline` (class)

```text
new (stream: WritableStream, options?: { autoCommit?: boolean | undefined; } | undefined): Readline
```

## `createInterface` (function)

```text
(input: ReadableStream, output?: WritableStream | undefined, completer?: Completer | undefined, terminal?: boolean | undefined): Interface
(options: ReadLineOptions): Interface
```
