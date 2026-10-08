# Public surface: @cancjs/unhandled-rejection .

Generated. Do not edit by hand.

- Declarations: `packages/canc-unhandled-rejection/dist/types/index.d.ts`
- Exports: 11

## `RegisterOptions` (interface)

```text
abort?: boolean | undefined
onUnhandledRejection?: ((reason: unknown, promise?: Promise<unknown>) => void) | undefined
timeout?: boolean | undefined
warn?: boolean | undefined
```

## `register` (function)

```text
(options?: RegisterOptions | undefined): void
```

## `registerBrowser` (function)

```text
(options?: RegisterOptions | undefined): void
```

## `registerBun` (function)

```text
(options?: RegisterOptions | undefined): void
```

## `registerDeno` (function)

```text
(options?: RegisterOptions | undefined): void
```

## `registerEdgeRuntime` (function)

```text
(options?: RegisterOptions | undefined): void
```

## `registerElectron` (function)

```text
(options?: RegisterOptions | undefined): void
```

## `registerNode` (function)

```text
(options?: RegisterOptions | undefined): void
```

## `registerWorker` (function)

```text
(options?: RegisterOptions | undefined): void
```

## `setWarn` (function)

```text
(enabled: boolean): void
```

## `unregister` (function)

```text
(): void
```
