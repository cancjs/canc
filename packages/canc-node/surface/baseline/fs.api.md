# Public surface: @cancjs/node ./fs

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/fs/index.d.ts`
- Exports: 39

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

## `access` (const)

```text
(path: PathLike, mode?: number | undefined): CancelablePromise<TValue>
```

## `appendFile` (const)

```text
(path: PathLike | FileHandle, data: string | Uint8Array<ArrayBufferLike>, options?: (ObjectEncodingOptions & FlagAndOpenMode & { flush?: boolean | undefined; }) | BufferEncoding | null | undefined): CancelablePromise<TValue>
```

## `chmod` (const)

```text
(path: PathLike, mode: Mode): CancelablePromise<TValue>
```

## `chown` (const)

```text
(path: PathLike, uid: number, gid: number): CancelablePromise<TValue>
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
(src: PathLike, dest: PathLike, mode?: number | undefined): CancelablePromise<TValue>
```

## `cp` (const)

```text
(source: string | URL, destination: string | URL, opts?: CopyOptions | undefined): CancelablePromise<TValue>
```

## `exists` (const)

```text
(path: PathLike): CancelablePromise<TValue>
```

## `glob` (const)

```text
(pattern: string | ReadonlyArray<string>, options?: { cwd?: string | undefined; exclude?: ((path: string) => boolean) | undefined; withFileTypes?: boolean | undefined; } | undefined): AsyncIterable<string>
```

## `lchmod` (const)

```text
(path: PathLike, mode: Mode): CancelablePromise<TValue>
```

## `lchown` (const)

```text
(path: PathLike, uid: number, gid: number): CancelablePromise<TValue>
```

## `link` (const)

```text
(existingPath: PathLike, newPath: PathLike): CancelablePromise<TValue>
```

## `lstat` (const)

```text
(path: PathLike, opts?: (StatOptions & { bigint?: false | undefined; }) | undefined): CancelablePromise<TValue>
(path: PathLike, opts: StatOptions & { bigint: true; }): CancelablePromise<TValue>
(path: PathLike, opts?: StatOptions | undefined): CancelablePromise<TValue>
```

## `lutimes` (const)

```text
(path: PathLike, atime: TimeLike, mtime: TimeLike): CancelablePromise<TValue>
```

## `mkdir` (const)

```text
(path: PathLike, options: MakeDirectoryOptions & { recursive: true; }): CancelablePromise<TValue>
(path: PathLike, options?: Mode | (MakeDirectoryOptions & { recursive?: false | undefined; }) | null | undefined): CancelablePromise<TValue>
(path: PathLike, options?: Mode | MakeDirectoryOptions | null | undefined): CancelablePromise<TValue>
```

## `mkdtemp` (const)

```text
(prefix: string, options?: ObjectEncodingOptions | BufferEncoding | null | undefined): CancelablePromise<TValue>
(prefix: string, options: BufferEncodingOption): CancelablePromise<TValue>
```

## `mkdtempDisposable` (const)

```text
(prefix: string, options?: BufferEncoding | { encoding?: BufferEncoding | null | undefined; } | null | undefined): CancelablePromise<TValue>
```

## `open` (const)

```text
(path: PathLike, flags?: string | number | undefined, mode?: Mode | undefined): CancelablePromise<TValue>
```

## `opendir` (const)

```text
(path: PathLike, options?: OpenDirOptions | undefined): CancelablePromise<TValue>
```

## `readFile` (const)

```text
(path: PathLike | FileHandle, options?: ({ encoding?: null | undefined; flag?: OpenMode | undefined; } & Abortable) | null | undefined): CancelablePromise<TValue>
(path: PathLike | FileHandle, options: BufferEncoding | ({ encoding: BufferEncoding; flag?: OpenMode | undefined; } & Abortable)): CancelablePromise<TValue>
(path: PathLike | FileHandle, options?: BufferEncoding | (ObjectEncodingOptions & Abortable & { flag?: OpenMode | undefined; }) | null | undefined): CancelablePromise<TValue>
```

## `readdir` (const)

```text
(path: PathLike, options?: BufferEncoding | (ObjectEncodingOptions & { withFileTypes?: false | undefined; recursive?: boolean | undefined; }) | null | undefined): CancelablePromise<TValue>
(path: PathLike, options: "buffer" | { encoding: "buffer"; withFileTypes?: false | undefined; recursive?: boolean | undefined; }): CancelablePromise<TValue>
(path: PathLike, options: ObjectEncodingOptions & { withFileTypes: true; recursive?: boolean | undefined; }): CancelablePromise<TValue>
(path: PathLike, options: { encoding: "buffer"; withFileTypes: true; recursive?: boolean | undefined; }): CancelablePromise<TValue>
```

## `readlink` (const)

```text
(path: PathLike, options?: ObjectEncodingOptions | BufferEncoding | null | undefined): CancelablePromise<TValue>
(path: PathLike, options: BufferEncodingOption): CancelablePromise<TValue>
(path: PathLike, options?: string | ObjectEncodingOptions | null | undefined): CancelablePromise<TValue>
```

## `realpath` (const)

```text
(path: PathLike, options?: ObjectEncodingOptions | BufferEncoding | null | undefined): CancelablePromise<TValue>
(path: PathLike, options: BufferEncodingOption): CancelablePromise<TValue>
```

## `rename` (const)

```text
(oldPath: PathLike, newPath: PathLike): CancelablePromise<TValue>
```

## `rm` (const)

```text
(path: PathLike, options?: RmOptions | undefined): CancelablePromise<TValue>
```

## `rmdir` (const)

```text
(path: PathLike, options?: RmDirOptions | undefined): CancelablePromise<TValue>
```

## `stat` (const)

```text
(path: PathLike, opts?: (StatOptions & { bigint?: false | undefined; }) | undefined): CancelablePromise<TValue>
(path: PathLike, opts: StatOptions & { bigint: true; }): CancelablePromise<TValue>
(path: PathLike, opts?: StatOptions | undefined): CancelablePromise<TValue>
```

## `statfs` (const)

```text
(path: PathLike, opts?: (StatFsOptions & { bigint?: false | undefined; }) | undefined): CancelablePromise<TValue>
(path: PathLike, opts: StatFsOptions & { bigint: true; }): CancelablePromise<TValue>
(path: PathLike, opts?: StatFsOptions | undefined): CancelablePromise<TValue>
```

## `symlink` (const)

```text
(target: PathLike, path: PathLike, type?: string | null | undefined): CancelablePromise<TValue>
```

## `truncate` (const)

```text
(path: PathLike, len?: number | undefined): CancelablePromise<TValue>
```

## `unlink` (const)

```text
(path: PathLike): CancelablePromise<TValue>
```

## `utimes` (const)

```text
(path: PathLike, atime: TimeLike, mtime: TimeLike): CancelablePromise<TValue>
```

## `watch` (const)

```text
(filename: PathLike, options: "buffer" | (WatchOptions & { encoding: "buffer"; })): AsyncIterable<FileChangeInfo<NonSharedBuffer>>
(filename: PathLike, options?: BufferEncoding | WatchOptions | undefined): AsyncIterable<FileChangeInfo<string>>
(filename: PathLike, options: string | WatchOptions): AsyncIterable<FileChangeInfo<NonSharedBuffer>> | AsyncIterable<FileChangeInfo<string>>
```

## `writeFile` (const)

```text
(file: PathLike | FileHandle, data: string | ArrayBufferView<ArrayBufferLike> | Iterable<string | ArrayBufferView<ArrayBufferLike>> | AsyncIterable<string | ArrayBufferView<ArrayBufferLike>> | Stream, options?: BufferEncoding | (ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; } & Abortable) | null | undefined): CancelablePromise<TValue>
```
