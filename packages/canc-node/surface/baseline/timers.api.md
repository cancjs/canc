# Public surface: @cancjs/node ./timers

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/timers/index.d.ts`
- Exports: 7

## `ICancelableIntervalIterator<T>` (interface)

```text
extends AsyncIterableIterator<T>
cancel: () => void
```

## `ISchedulerWaitOptions` (interface)

```text
signal?: AbortSignal | undefined
```

## `ITimersOptions` (interface)

```text
ref?: boolean | undefined
signal?: AbortSignal | undefined
```

## `scheduler` (const)

```text
wait: (delay: number, options?: ISchedulerWaitOptions) => CancelablePromise<void>
yield: () => Promise<void>
```

## `setImmediate<T = void>` (function)

```text
<T = void>(value?: T | undefined, options?: ITimersOptions | undefined): CancelablePromise<T>
```

## `setInterval<T = number>` (function)

```text
<T = number>(delay?: number | undefined, value?: T | undefined, options?: ITimersOptions | undefined): ICancelableIntervalIterator<T>
```

## `setTimeout<T = void>` (function)

```text
<T = void>(delay?: number | undefined, value?: T | undefined, options?: ITimersOptions | undefined): CancelablePromise<T>
```
