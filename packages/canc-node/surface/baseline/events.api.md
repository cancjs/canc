# Public surface: @cancjs/node ./events

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/events/index.d.ts`
- Exports: 8

## `EventEmitter<T extends EventMap<T> = DefaultEventMap>` (class)

```text
extends NodeJS.EventEmitter<T>
new <T extends EventMap<T> = DefaultEventMap>(options?: EventEmitterOptions | undefined): EventEmitter<T>
```

## `ICancelableEventIterator` (interface)

```text
extends AsyncIterableIterator<any[]>
[asyncIterator]: () => ICancelableEventIterator
next: () => CancelablePromise<IteratorResult<any[], undefined>>
return: (value?: undefined) => Promise<IteratorResult<any[], undefined>>
throw: (error?: unknown) => Promise<IteratorResult<any[], undefined>>
```

## `IOnOptions` (interface)

```text
extends IOnceOptions
close?: Array<string> | undefined
highWaterMark?: number | undefined
lowWaterMark?: number | undefined
signal?: AbortSignal | undefined
```

## `IOnceOptions` (interface)

```text
signal?: AbortSignal | undefined
```

## `TAddAbortListener` (type)

```text
(signal: AbortSignal, listener: (event: Event) => void): Disposable
```

## `addAbortListener` (const)

```text
(signal: AbortSignal, listener: (event: Event) => void): Disposable
```

## `on` (function)

```text
(emitter: EventEmitter<DefaultEventMap>, eventName: string | symbol, options?: IOnOptions | undefined): ICancelableEventIterator
(emitter: EventTarget, eventName: string, options?: IOnOptions | undefined): ICancelableEventIterator
```

## `once` (function)

```text
(emitter: EventEmitter<DefaultEventMap>, eventName: string | symbol, options?: IOnceOptions | undefined): CancelablePromise<Array<any>, never>
(emitter: EventTarget, eventName: string, options?: IOnceOptions | undefined): CancelablePromise<Array<any>, never>
```
