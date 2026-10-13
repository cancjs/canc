# Public surface: @cancjs/node ./fs/extra

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/fs-extra/index.d.ts`
- Exports: 44

## `ICopyOptions` (interface)

```text
errorOnExist?: boolean | undefined
filter?: ((src: string, dest: string) => Promise<boolean> | boolean) | undefined
onProgress?: ((progress: { src: string; dest: string; }) => void) | undefined
overwrite?: boolean | undefined
```

## `IMoveOptions` (interface)

```text
overwrite?: boolean | undefined
```

## `IOutputFileOptions` (type)

```text
(EventEmitter.Abortable & ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; }) | BufferEncoding | null | undefined
```

## `IOutputFileSyncOptions` (type)

```text
WriteFileOptions | undefined
```

## `IOutputJsonOptions` (type)

```text
EOL?: string | undefined
encoding?: BufferEncoding | null | undefined
flag?: string | undefined
mode?: number | string | undefined
replacer?: ((this: unknown, key: string, value: unknown) => unknown) | Array<number | string> | null | undefined
spaces?: null | number | string | undefined
```

## `IReadJsonOptions` (interface)

```text
encoding?: BufferEncoding | null | undefined
flag?: string | undefined
reviver?: ((this: unknown, key: string, value: unknown) => unknown) | undefined
throws?: boolean | undefined
```

## `IReplaceFileOptions` (type)

```text
(EventEmitter.Abortable & ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; }) | BufferEncoding | null | undefined
```

## `IReplaceFileSyncOptions` (type)

```text
WriteFileOptions | undefined
```

## `IWalkEntry` (interface)

```text
dirent?: Dirent<string> | undefined
error?: unknown
path: string
stats?: Stats | undefined
```

## `IWalkOptions` (interface)

```text
depth?: number | undefined
filter?: ((entry: IWalkEntry) => Promise<boolean> | boolean) | undefined
followSymlinks?: boolean | undefined
onError?: TWalkOnError | undefined
order?: TWalkOrder | undefined
stats?: boolean | undefined
```

## `IWalkSyncOptions` (interface)

```text
extends Omit<IWalkOptions, 'filter'>
depth?: number | undefined
filter?: ((entry: IWalkEntry) => boolean) | undefined
followSymlinks?: boolean | undefined
onError?: TWalkOnError | undefined
order?: TWalkOrder | undefined
stats?: boolean | undefined
```

## `IWriteJsonOptions` (interface)

```text
EOL?: string | undefined
encoding?: BufferEncoding | null | undefined
flag?: string | undefined
mode?: number | string | undefined
replacer?: ((this: unknown, key: string, value: unknown) => unknown) | Array<number | string> | null | undefined
spaces?: null | number | string | undefined
```

## `TWalkOnError` (type)

```text
"skip" | "throw" | "yield"
```

## `TWalkOrder` (type)

```text
"breadth-first" | "children-first" | "depth-first"
```

## `copy` (function)

```text
(src: string, dest: string, options?: ICopyOptions | undefined): CancelablePromise<void, unknown>
```

## `emptyDir` (function)

```text
(dir: string): CancelablePromise<void, Unlisted>
```

## `emptyDirSync` (function)

```text
(dir: string): void
```

## `ensureDir` (function)

```text
(path: string): CancelablePromise<void, Unlisted>
```

## `ensureDirSync` (function)

```text
(path: string): void
```

## `ensureFile` (function)

```text
(path: string): CancelablePromise<void, Unlisted>
```

## `ensureFileSync` (function)

```text
(path: string): void
```

## `ensureLink` (function)

```text
(srcPath: string, dstPath: string): CancelablePromise<void, Unlisted>
```

## `ensureLinkSync` (function)

```text
(srcPath: string, dstPath: string): void
```

## `ensureSymlink` (function)

```text
(srcPath: string, dstPath: string, type?: string | undefined): CancelablePromise<void, Unlisted>
```

## `ensureSymlinkSync` (function)

```text
(srcPath: string, dstPath: string, type?: Type | null | undefined): void
```

## `mkdirp` (const)

```text
(path: string): CancelablePromise<void, Unlisted>
```

## `mkdirpSync` (const)

```text
(path: string): void
```

## `mkdirs` (const)

```text
(path: string): CancelablePromise<void, Unlisted>
```

## `mkdirsSync` (const)

```text
(path: string): void
```

## `move` (function)

```text
(src: string, dest: string, options?: IMoveOptions | undefined): CancelablePromise<void, Unlisted>
```

## `moveSync` (function)

```text
(src: string, dest: string, options?: IMoveOptions | undefined): void
```

## `outputFile` (function)

```text
(path: string, data: ArrayBufferView<ArrayBufferLike> | AsyncIterable<ArrayBufferView<ArrayBufferLike> | string> | Iterable<ArrayBufferView<ArrayBufferLike> | string> | Stream | string, options?: (Abortable & ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; }) | BufferEncoding | null | undefined): CancelablePromise<void, Unlisted>
```

## `outputFileSync` (function)

```text
(path: string, data: ArrayBufferView<ArrayBufferLike> | string, options?: WriteFileOptions | undefined): void
```

## `outputJson` (function)

```text
(file: string, data: unknown, options?: BufferEncoding | IWriteJsonOptions | null | undefined): CancelablePromise<void, unknown>
```

## `outputJsonSync` (function)

```text
(file: string, data: unknown, options?: BufferEncoding | IWriteJsonOptions | null | undefined): void
```

## `pathExists` (const)

```text
(path: PathLike): CancelablePromise<boolean, never>
```

## `readJson<T = any>` (function)

```text
<T = any>(file: string, options: IReadJsonOptions & { throws: false; }): CancelablePromise<T | null, Unlisted>
<T = any>(file: string, options?: BufferEncoding | IReadJsonOptions | null | undefined): CancelablePromise<T, Unlisted>
```

## `readJsonSync<T = any>` (function)

```text
<T = any>(file: string, options: IReadJsonOptions & { throws: false; }): T | null
<T = any>(file: string, options?: BufferEncoding | IReadJsonOptions | null | undefined): T
```

## `replaceFile` (function)

```text
(path: string, data: ArrayBufferView<ArrayBufferLike> | AsyncIterable<ArrayBufferView<ArrayBufferLike> | string> | Iterable<ArrayBufferView<ArrayBufferLike> | string> | Stream | string, options?: (Abortable & ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; }) | BufferEncoding | null | undefined): CancelablePromise<void, Unlisted>
```

## `replaceFileSync` (function)

```text
(path: string, data: ArrayBufferView<ArrayBufferLike> | string, options?: WriteFileOptions | undefined): void
```

## `walk` (function)

```text
(dir: string, options?: IWalkOptions | undefined): AsyncGenerator<IWalkEntry, void, unknown>
```

## `walkSync` (function)

```text
(dir: string, options?: IWalkSyncOptions | undefined): Generator<IWalkEntry, void, unknown>
```

## `writeJson` (function)

```text
(file: string, object: unknown, options?: BufferEncoding | IWriteJsonOptions | null | undefined): CancelablePromise<void, unknown>
```

## `writeJsonSync` (function)

```text
(file: string, object: unknown, options?: BufferEncoding | IWriteJsonOptions | null | undefined): void
```
