# Public surface: @cancjs/node ./fs

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/fs/index.d.ts`
- Exports: 40

## `BigIntStats` (interface)

```text
extends StatsBase<bigint>
```

## `Dir` (const)

```text
new (): Dir
```

## `Dirent` (const)

```text
new <Name extends string | Buffer = string>(): Dirent<Name>
```

## `StatFs` (class)

```text
extends StatsFsBase<number>
new (): StatsFs
```

## `Stats` (const)

```text
new (): Stats
```

## `TCancelableFileHandle<THandle = nodeFsPromises.FileHandle>` (type)

```text
{ [K in keyof THandle]: K extends keyof THandle & TOverriddenHandleKeys ? TNodeSignatures<THandle[K], "cancelable"> : THandle[K]; }
```

## `access` (const)

```text
(path: PathLike, mode?: number | undefined): CancelablePromise<void>
```

## `appendFile` (const)

```text
(path: PathLike | FileHandle, data: string | Uint8Array<ArrayBufferLike>, options?: BufferEncoding | (ObjectEncodingOptions & FlagAndOpenMode & { flush?: boolean | undefined; }) | null | undefined): CancelablePromise<void>
```

## `chmod` (const)

```text
(path: PathLike, mode: Mode): CancelablePromise<void>
```

## `chown` (const)

```text
(path: PathLike, uid: number, gid: number): CancelablePromise<void>
```

## `constants` (const)

```text
COPYFILE_EXCL: number
COPYFILE_FICLONE: number
COPYFILE_FICLONE_FORCE: number
F_OK: number
O_APPEND: number
O_CREAT: number
O_DIRECT: number
O_DIRECTORY: number
O_DSYNC: number
O_EXCL: number
O_NOATIME: number
O_NOCTTY: number
O_NOFOLLOW: number
O_NONBLOCK: number
O_RDONLY: number
O_RDWR: number
O_SYMLINK: number
O_SYNC: number
O_TRUNC: number
O_WRONLY: number
R_OK: number
S_IFBLK: number
S_IFCHR: number
S_IFDIR: number
S_IFIFO: number
S_IFLNK: number
S_IFMT: number
S_IFREG: number
S_IFSOCK: number
S_IRGRP: number
S_IROTH: number
S_IRUSR: number
S_IRWXG: number
S_IRWXO: number
S_IRWXU: number
S_IWGRP: number
S_IWOTH: number
S_IWUSR: number
S_IXGRP: number
S_IXOTH: number
S_IXUSR: number
UV_FS_O_FILEMAP: number
W_OK: number
X_OK: number
```

## `copyFile` (const)

```text
(src: PathLike, dest: PathLike, mode?: number | undefined): CancelablePromise<void>
```

## `cp` (const)

```text
(source: string | URL, destination: string | URL, opts?: CopyOptions | undefined): CancelablePromise<void>
```

## `exists` (const)

```text
(path: PathLike): CancelablePromise<boolean>
```

## `glob` (const)

```text
(pattern: string | ReadonlyArray<string>, options?: { cwd?: string | undefined; exclude?: ((path: string) => boolean) | undefined; withFileTypes?: boolean | undefined; } | undefined): AsyncIterable<string>
```

## `lchmod` (const)

```text
(path: PathLike, mode: Mode): CancelablePromise<void>
```

## `lchown` (const)

```text
(path: PathLike, uid: number, gid: number): CancelablePromise<void>
```

## `link` (const)

```text
(existingPath: PathLike, newPath: PathLike): CancelablePromise<void>
```

## `lstat` (const)

```text
(path: PathLike, opts?: (StatOptions & { bigint?: false | undefined; }) | undefined): CancelablePromise<Stats>
(path: PathLike, opts: StatOptions & { bigint: true; }): CancelablePromise<BigIntStats>
(path: PathLike, opts?: StatOptions | undefined): CancelablePromise<Stats | BigIntStats>
```

## `lutimes` (const)

```text
(path: PathLike, atime: TimeLike, mtime: TimeLike): CancelablePromise<void>
```

## `mkdir` (const)

```text
(path: PathLike, options: MakeDirectoryOptions & { recursive: true; }): CancelablePromise<string | undefined>
(path: PathLike, options?: Mode | (MakeDirectoryOptions & { recursive?: false | undefined; }) | null | undefined): CancelablePromise<void>
(path: PathLike, options?: Mode | MakeDirectoryOptions | null | undefined): CancelablePromise<string | undefined>
```

## `mkdtemp` (const)

```text
(prefix: string, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<string>
(prefix: string, options: BufferEncodingOption): CancelablePromise<NonSharedBuffer>
(prefix: string, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<string | NonSharedBuffer>
```

## `mkdtempDisposable` (const)

```text
(prefix: string, options?: BufferEncoding | { encoding?: BufferEncoding | null | undefined; } | null | undefined): CancelablePromise<IDisposableTempDir>
```

## `open` (const)

```text
(path: PathLike, flags?: string | number | undefined, mode?: Mode | undefined): CancelablePromise<TCancelableFileHandle<FileHandle>>
```

## `opendir` (const)

```text
(path: PathLike, options?: OpenDirOptions | undefined): CancelablePromise<Dir>
```

## `readFile` (const)

```text
(path: PathLike | FileHandle, options?: ({ encoding?: null | undefined; flag?: OpenMode | undefined; } & Abortable) | null | undefined): CancelablePromise<NonSharedBuffer>
(path: PathLike | FileHandle, options: BufferEncoding | ({ encoding: BufferEncoding; flag?: OpenMode | undefined; } & Abortable)): CancelablePromise<string>
(path: PathLike | FileHandle, options?: BufferEncoding | (ObjectEncodingOptions & Abortable & { flag?: OpenMode | undefined; }) | null | undefined): CancelablePromise<string | NonSharedBuffer>
```

## `readdir` (const)

```text
(path: PathLike, options?: BufferEncoding | (ObjectEncodingOptions & { withFileTypes?: false | undefined; recursive?: boolean | undefined; }) | null | undefined): CancelablePromise<Array<string>>
(path: PathLike, options: "buffer" | { encoding: "buffer"; withFileTypes?: false | undefined; recursive?: boolean | undefined; }): CancelablePromise<Array<NonSharedBuffer>>
(path: PathLike, options?: BufferEncoding | (ObjectEncodingOptions & { withFileTypes?: false | undefined; recursive?: boolean | undefined; }) | null | undefined): CancelablePromise<Array<string> | Array<NonSharedBuffer>>
(path: PathLike, options: ObjectEncodingOptions & { withFileTypes: true; recursive?: boolean | undefined; }): CancelablePromise<Array<Dirent<string>>>
(path: PathLike, options: { encoding: "buffer"; withFileTypes: true; recursive?: boolean | undefined; }): CancelablePromise<Array<Dirent<NonSharedBuffer>>>
```

## `readlink` (const)

```text
(path: PathLike, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<string>
(path: PathLike, options: BufferEncodingOption): CancelablePromise<NonSharedBuffer>
(path: PathLike, options?: string | ObjectEncodingOptions | null | undefined): CancelablePromise<string | NonSharedBuffer>
```

## `realpath` (const)

```text
(path: PathLike, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<string>
(path: PathLike, options: BufferEncodingOption): CancelablePromise<NonSharedBuffer>
(path: PathLike, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<string | NonSharedBuffer>
```

## `rename` (const)

```text
(oldPath: PathLike, newPath: PathLike): CancelablePromise<void>
```

## `rm` (const)

```text
(path: PathLike, options?: RmOptions | undefined): CancelablePromise<void>
```

## `rmdir` (const)

```text
(path: PathLike, options?: RmDirOptions | undefined): CancelablePromise<void>
```

## `stat` (const)

```text
(path: PathLike, opts?: (StatOptions & { bigint?: false | undefined; }) | undefined): CancelablePromise<Stats>
(path: PathLike, opts: StatOptions & { bigint: true; }): CancelablePromise<BigIntStats>
(path: PathLike, opts?: StatOptions | undefined): CancelablePromise<Stats | BigIntStats>
```

## `statfs` (const)

```text
(path: PathLike, opts?: (StatFsOptions & { bigint?: false | undefined; }) | undefined): CancelablePromise<StatsFs>
(path: PathLike, opts: StatFsOptions & { bigint: true; }): CancelablePromise<BigIntStatsFs>
(path: PathLike, opts?: StatFsOptions | undefined): CancelablePromise<StatsFs | BigIntStatsFs>
```

## `symlink` (const)

```text
(target: PathLike, path: PathLike, type?: string | null | undefined): CancelablePromise<void>
```

## `truncate` (const)

```text
(path: PathLike, len?: number | undefined): CancelablePromise<void>
```

## `unlink` (const)

```text
(path: PathLike): CancelablePromise<void>
```

## `utimes` (const)

```text
(path: PathLike, atime: TimeLike, mtime: TimeLike): CancelablePromise<void>
```

## `watch` (const)

```text
(filename: PathLike, options: "buffer" | (WatchOptions & { encoding: "buffer"; })): AsyncIterable<FileChangeInfo<NonSharedBuffer>>
(filename: PathLike, options?: BufferEncoding | WatchOptions | undefined): AsyncIterable<FileChangeInfo<string>>
(filename: PathLike, options: string | WatchOptions): AsyncIterable<FileChangeInfo<NonSharedBuffer>> | AsyncIterable<FileChangeInfo<string>>
```

## `writeFile` (const)

```text
(file: PathLike | FileHandle, data: string | Stream | ArrayBufferView<ArrayBufferLike> | Iterable<string | ArrayBufferView<ArrayBufferLike>> | AsyncIterable<string | ArrayBufferView<ArrayBufferLike>>, options?: BufferEncoding | (ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; } & Abortable) | null | undefined): CancelablePromise<void>
```
