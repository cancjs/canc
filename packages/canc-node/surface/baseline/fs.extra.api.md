# Public surface: @cancjs/node ./fs/extra

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/fs-extra/index.d.ts`
- Exports: 44

## `ICopyOptions` (interface)

```text
errorOnExist?: boolean | undefined
filter?: ((src: string, dest: string) => boolean | Promise<boolean>) | undefined
onProgress?: ((progress: { src: string; dest: string; }) => void) | undefined
overwrite?: boolean | undefined
```

## `IMoveOptions` (interface)

```text
overwrite?: boolean | undefined
```

## `IOutputFileOptions` (type)

```text
BufferEncoding | (ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; } & EventEmitter.Abortable) | null | undefined
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
mode?: string | number | undefined
replacer?: ((this: unknown, key: string, value: unknown) => unknown) | Array<string | number> | null | undefined
spaces?: string | number | null | undefined
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
BufferEncoding | (ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; } & EventEmitter.Abortable) | null | undefined
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
filter?: ((entry: IWalkEntry) => boolean | Promise<boolean>) | undefined
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
mode?: string | number | undefined
replacer?: ((this: unknown, key: string, value: unknown) => unknown) | Array<string | number> | null | undefined
spaces?: string | number | null | undefined
```

## `TWalkOnError` (type)

```text
"throw" | "skip" | "yield"
```

## `TWalkOrder` (type)

```text
"breadth-first" | "depth-first" | "children-first"
```

## `copy` (function)

```text
(src: string, dest: string, options?: ICopyOptions | undefined): CancelablePromise<void, never>
```

## `emptyDir` (function)

```text
(dir: string): CancelablePromise<void, never>
```

## `emptyDirSync` (function)

```text
(dir: string): void
```

## `ensureDir` (function)

```text
(path: string): CancelablePromise<void, never>
```

## `ensureDirSync` (function)

```text
(path: string): void
```

## `ensureFile` (function)

```text
(path: string): CancelablePromise<void, never>
```

## `ensureFileSync` (function)

```text
(path: string): void
```

## `ensureLink` (function)

```text
(srcPath: string, dstPath: string): CancelablePromise<void, never>
```

## `ensureLinkSync` (function)

```text
(srcPath: string, dstPath: string): void
```

## `ensureSymlink` (function)

```text
(srcPath: string, dstPath: string, type?: string | undefined): CancelablePromise<void, never>
```

## `ensureSymlinkSync` (function)

```text
(srcPath: string, dstPath: string, type?: Type | null | undefined): void
```

## `mkdirp` (const)

```text
(path: string): CancelablePromise<void, never>
```

## `mkdirpSync` (const)

```text
(path: string): void
```

## `mkdirs` (const)

```text
(path: string): CancelablePromise<void, never>
```

## `mkdirsSync` (const)

```text
(path: string): void
```

## `move` (function)

```text
(src: string, dest: string, options?: IMoveOptions | undefined): CancelablePromise<void, never>
```

## `moveSync` (function)

```text
(src: string, dest: string, options?: IMoveOptions | undefined): void
```

## `outputFile` (function)

```text
(path: string, data: string | Stream | ArrayBufferView<ArrayBufferLike> | Iterable<string | ArrayBufferView<ArrayBufferLike>> | AsyncIterable<string | ArrayBufferView<ArrayBufferLike>>, options?: BufferEncoding | (ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; } & Abortable) | null | undefined): CancelablePromise<void, never>
```

## `outputFileSync` (function)

```text
(path: string, data: string | ArrayBufferView<ArrayBufferLike>, options?: WriteFileOptions | undefined): void
```

## `outputJson` (function)

```text
(file: string, data: unknown, options?: BufferEncoding | IWriteJsonOptions | null | undefined): CancelablePromise<void, never>
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
<T = any>(file: string, options: IReadJsonOptions & { throws: false; }): CancelablePromise<T | null, never>
<T = any>(file: string, options?: BufferEncoding | IReadJsonOptions | null | undefined): CancelablePromise<T, never>
```

## `readJsonSync<T = any>` (function)

```text
<T = any>(file: string, options: IReadJsonOptions & { throws: false; }): T | null
<T = any>(file: string, options?: BufferEncoding | IReadJsonOptions | null | undefined): T
```

## `replaceFile` (function)

```text
(path: string, data: string | Stream | ArrayBufferView<ArrayBufferLike> | Iterable<string | ArrayBufferView<ArrayBufferLike>> | AsyncIterable<string | ArrayBufferView<ArrayBufferLike>>, options?: BufferEncoding | (ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; } & Abortable) | null | undefined): CancelablePromise<void, never>
```

## `replaceFileSync` (function)

```text
(path: string, data: string | ArrayBufferView<ArrayBufferLike>, options?: WriteFileOptions | undefined): void
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
(file: string, object: unknown, options?: BufferEncoding | IWriteJsonOptions | null | undefined): CancelablePromise<void, never>
```

## `writeJsonSync` (function)

```text
(file: string, object: unknown, options?: BufferEncoding | IWriteJsonOptions | null | undefined): void
```
