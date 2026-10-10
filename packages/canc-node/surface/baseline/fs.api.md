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
new <Name extends Buffer | string = string>(): Dirent<Name>
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
{ [K in keyof THandle]: K extends TOverriddenHandleKeys & keyof THandle ? TNodeSignatures<THandle[K], "cancelable"> : THandle[K]; }
```

## `access` (const)

```text
(path: PathLike, mode?: number | undefined): CancelablePromise<void, never>
```

## `appendFile` (const)

```text
(path: FileHandle | PathLike, data: Uint8Array<ArrayBufferLike> | string, options?: (FlagAndOpenMode & ObjectEncodingOptions & { flush?: boolean | undefined; }) | BufferEncoding | null | undefined): CancelablePromise<void, never>
```

## `chmod` (const)

```text
(path: PathLike, mode: Mode): CancelablePromise<void, never>
```

## `chown` (const)

```text
(path: PathLike, uid: number, gid: number): CancelablePromise<void, never>
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
(src: PathLike, dest: PathLike, mode?: number | undefined): CancelablePromise<void, never>
```

## `cp` (const)

```text
(source: URL | string, destination: URL | string, opts?: CopyOptions | undefined): CancelablePromise<void, never>
```

## `exists` (const)

```text
(path: PathLike): CancelablePromise<boolean, never>
```

## `glob` (const)

```text
(pattern: ReadonlyArray<string> | string, options?: undefined | { cwd?: string | undefined; exclude?: ((path: string) => boolean) | undefined; withFileTypes?: boolean | undefined; }): AsyncIterable<string>
```

## `lchmod` (const)

```text
(path: PathLike, mode: Mode): CancelablePromise<void, never>
```

## `lchown` (const)

```text
(path: PathLike, uid: number, gid: number): CancelablePromise<void, never>
```

## `link` (const)

```text
(existingPath: PathLike, newPath: PathLike): CancelablePromise<void, never>
```

## `lstat` (const)

```text
(path: PathLike, opts?: (StatOptions & { bigint?: false | undefined; }) | undefined): CancelablePromise<Stats, never>
(path: PathLike, opts: StatOptions & { bigint: true; }): CancelablePromise<BigIntStats, never>
(path: PathLike, opts?: StatOptions | undefined): CancelablePromise<BigIntStats | Stats, never>
```

## `lutimes` (const)

```text
(path: PathLike, atime: TimeLike, mtime: TimeLike): CancelablePromise<void, never>
```

## `mkdir` (const)

```text
(path: PathLike, options: MakeDirectoryOptions & { recursive: true; }): CancelablePromise<string | undefined, never>
(path: PathLike, options?: (MakeDirectoryOptions & { recursive?: false | undefined; }) | Mode | null | undefined): CancelablePromise<void, never>
(path: PathLike, options?: MakeDirectoryOptions | Mode | null | undefined): CancelablePromise<string | undefined, never>
```

## `mkdtemp` (const)

```text
(prefix: string, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<string, never>
(prefix: string, options: BufferEncodingOption): CancelablePromise<NonSharedBuffer, never>
(prefix: string, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<NonSharedBuffer | string, never>
```

## `mkdtempDisposable` (const)

```text
(prefix: string, options?: BufferEncoding | null | undefined | { encoding?: BufferEncoding | null | undefined; }): CancelablePromise<IDisposableTempDir, never>
```

## `open` (const)

```text
(path: PathLike, flags?: number | string | undefined, mode?: Mode | undefined): CancelablePromise<TCancelableFileHandle<FileHandle>, never>
```

## `opendir` (const)

```text
(path: PathLike, options?: OpenDirOptions | undefined): CancelablePromise<Dir, never>
```

## `readFile` (const)

```text
(path: FileHandle | PathLike, options?: (Abortable & { encoding?: null | undefined; flag?: OpenMode | undefined; }) | null | undefined): CancelablePromise<NonSharedBuffer, never>
(path: FileHandle | PathLike, options: (Abortable & { encoding: BufferEncoding; flag?: OpenMode | undefined; }) | BufferEncoding): CancelablePromise<string, never>
(path: FileHandle | PathLike, options?: (Abortable & ObjectEncodingOptions & { flag?: OpenMode | undefined; }) | BufferEncoding | null | undefined): CancelablePromise<NonSharedBuffer | string, never>
```

## `readdir` (const)

```text
(path: PathLike, options?: (ObjectEncodingOptions & { withFileTypes?: false | undefined; recursive?: boolean | undefined; }) | BufferEncoding | null | undefined): CancelablePromise<Array<string>, never>
(path: PathLike, options: "buffer" | { encoding: "buffer"; withFileTypes?: false | undefined; recursive?: boolean | undefined; }): CancelablePromise<Array<NonSharedBuffer>, never>
(path: PathLike, options?: (ObjectEncodingOptions & { withFileTypes?: false | undefined; recursive?: boolean | undefined; }) | BufferEncoding | null | undefined): CancelablePromise<Array<NonSharedBuffer> | Array<string>, never>
(path: PathLike, options: ObjectEncodingOptions & { withFileTypes: true; recursive?: boolean | undefined; }): CancelablePromise<Array<Dirent<string>>, never>
(path: PathLike, options: { encoding: "buffer"; withFileTypes: true; recursive?: boolean | undefined; }): CancelablePromise<Array<Dirent<NonSharedBuffer>>, never>
```

## `readlink` (const)

```text
(path: PathLike, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<string, never>
(path: PathLike, options: BufferEncodingOption): CancelablePromise<NonSharedBuffer, never>
(path: PathLike, options?: ObjectEncodingOptions | null | string | undefined): CancelablePromise<NonSharedBuffer | string, never>
```

## `realpath` (const)

```text
(path: PathLike, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<string, never>
(path: PathLike, options: BufferEncodingOption): CancelablePromise<NonSharedBuffer, never>
(path: PathLike, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<NonSharedBuffer | string, never>
```

## `rename` (const)

```text
(oldPath: PathLike, newPath: PathLike): CancelablePromise<void, never>
```

## `rm` (const)

```text
(path: PathLike, options?: RmOptions | undefined): CancelablePromise<void, never>
```

## `rmdir` (const)

```text
(path: PathLike, options?: RmDirOptions | undefined): CancelablePromise<void, never>
```

## `stat` (const)

```text
(path: PathLike, opts?: (StatOptions & { bigint?: false | undefined; }) | undefined): CancelablePromise<Stats, never>
(path: PathLike, opts: StatOptions & { bigint: true; }): CancelablePromise<BigIntStats, never>
(path: PathLike, opts?: StatOptions | undefined): CancelablePromise<BigIntStats | Stats, never>
```

## `statfs` (const)

```text
(path: PathLike, opts?: (StatFsOptions & { bigint?: false | undefined; }) | undefined): CancelablePromise<StatsFs, never>
(path: PathLike, opts: StatFsOptions & { bigint: true; }): CancelablePromise<BigIntStatsFs, never>
(path: PathLike, opts?: StatFsOptions | undefined): CancelablePromise<BigIntStatsFs | StatsFs, never>
```

## `symlink` (const)

```text
(target: PathLike, path: PathLike, type?: null | string | undefined): CancelablePromise<void, never>
```

## `truncate` (const)

```text
(path: PathLike, len?: number | undefined): CancelablePromise<void, never>
```

## `unlink` (const)

```text
(path: PathLike): CancelablePromise<void, never>
```

## `utimes` (const)

```text
(path: PathLike, atime: TimeLike, mtime: TimeLike): CancelablePromise<void, never>
```

## `watch` (const)

```text
(filename: PathLike, options: "buffer" | (WatchOptions & { encoding: "buffer"; })): AsyncIterable<FileChangeInfo<NonSharedBuffer>>
(filename: PathLike, options?: BufferEncoding | WatchOptions | undefined): AsyncIterable<FileChangeInfo<string>>
(filename: PathLike, options: WatchOptions | string): AsyncIterable<FileChangeInfo<NonSharedBuffer>> | AsyncIterable<FileChangeInfo<string>>
```

## `writeFile` (const)

```text
(file: FileHandle | PathLike, data: ArrayBufferView<ArrayBufferLike> | AsyncIterable<ArrayBufferView<ArrayBufferLike> | string> | Iterable<ArrayBufferView<ArrayBufferLike> | string> | Stream | string, options?: (Abortable & ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; }) | BufferEncoding | null | undefined): CancelablePromise<void, never>
```
