# Public surface: @cancjs/node ./fs

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/fs/index.d.ts`
- Exports: 45

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

## `IFsLike` (type)

```text
(Partial<Omit<IFsSurface, "accessSync">> & Required<Pick<IFsSurface, "accessSync">>) | (Partial<Omit<IFsSurface, "appendFile">> & Required<Pick<IFsSurface, "appendFile">>) | (Partial<Omit<IFsSurface, "appendFileSync">> & Required<Pick<IFsSurface, "appendFileSync">>) | (Partial<Omit<IFsSurface, "chmod">> & Required<Pick<IFsSurface, "chmod">>) | (Partial<Omit<IFsSurface, "chmodSync">> & Required<Pick<IFsSurface, "chmodSync">>) | (Partial<Omit<IFsSurface, "chown">> & Required<Pick<IFsSurface, "chown">>) | (Partial<Omit<IFsSurface, "chownSync">> & Required<Pick<IFsSurface, "chownSync">>) | (Partial<Omit<IFsSurface, "closeSync">> & Required<Pick<IFsSurface, "closeSync">>) | (Partial<Omit<IFsSurface, "copyFile">> & Required<Pick<IFsSurface, "copyFile">>) | (Partial<Omit<IFsSurface, "copyFileSync">> & Required<Pick<IFsSurface, "copyFileSync">>) | (Partial<Omit<IFsSurface, "cpSync">> & Required<Pick<IFsSurface, "cpSync">>) | (Partial<Omit<IFsSurface, "exists">> & Required<Pick<IFsSurface, "exists">>) | (Partial<Omit<IFsSurface, "existsSync">> & Required<Pick<IFsSurface, "existsSync">>) | (Partial<Omit<IFsSurface, "fchmodSync">> & Required<Pick<IFsSurface, "fchmodSync">>) | (Partial<Omit<IFsSurface, "fchownSync">> & Required<Pick<IFsSurface, "fchownSync">>) | (Partial<Omit<IFsSurface, "fdatasyncSync">> & Required<Pick<IFsSurface, "fdatasyncSync">>) | (Partial<Omit<IFsSurface, "fstatSync">> & Required<Pick<IFsSurface, "fstatSync">>) | (Partial<Omit<IFsSurface, "fsyncSync">> & Required<Pick<IFsSurface, "fsyncSync">>) | (Partial<Omit<IFsSurface, "ftruncateSync">> & Required<Pick<IFsSurface, "ftruncateSync">>) | (Partial<Omit<IFsSurface, "futimesSync">> & Required<Pick<IFsSurface, "futimesSync">>) | (Partial<Omit<IFsSurface, "lchmod">> & Required<Pick<IFsSurface, "lchmod">>) | (Partial<Omit<IFsSurface, "lchmodSync">> & Required<Pick<IFsSurface, "lchmodSync">>) | (Partial<Omit<IFsSurface, "lchown">> & Required<Pick<IFsSurface, "lchown">>) | (Partial<Omit<IFsSurface, "lchownSync">> & Required<Pick<IFsSurface, "lchownSync">>) | (Partial<Omit<IFsSurface, "linkSync">> & Required<Pick<IFsSurface, "linkSync">>) | (Partial<Omit<IFsSurface, "lstat">> & Required<Pick<IFsSurface, "lstat">>) | (Partial<Omit<IFsSurface, "lstatSync">> & Required<Pick<IFsSurface, "lstatSync">>) | (Partial<Omit<IFsSurface, "lutimesSync">> & Required<Pick<IFsSurface, "lutimesSync">>) | (Partial<Omit<IFsSurface, "mkdirSync">> & Required<Pick<IFsSurface, "mkdirSync">>) | (Partial<Omit<IFsSurface, "mkdtempSync">> & Required<Pick<IFsSurface, "mkdtempSync">>) | (Partial<Omit<IFsSurface, "openSync">> & Required<Pick<IFsSurface, "openSync">>) | (Partial<Omit<IFsSurface, "opendirSync">> & Required<Pick<IFsSurface, "opendirSync">>) | (Partial<Omit<IFsSurface, "promises">> & Required<Pick<IFsSurface, "promises">>) | (Partial<Omit<IFsSurface, "readFile">> & Required<Pick<IFsSurface, "readFile">>) | (Partial<Omit<IFsSurface, "readFileSync">> & Required<Pick<IFsSurface, "readFileSync">>) | (Partial<Omit<IFsSurface, "readSync">> & Required<Pick<IFsSurface, "readSync">>) | (Partial<Omit<IFsSurface, "readdir">> & Required<Pick<IFsSurface, "readdir">>) | (Partial<Omit<IFsSurface, "readdirSync">> & Required<Pick<IFsSurface, "readdirSync">>) | (Partial<Omit<IFsSurface, "readlinkSync">> & Required<Pick<IFsSurface, "readlinkSync">>) | (Partial<Omit<IFsSurface, "readvSync">> & Required<Pick<IFsSurface, "readvSync">>) | (Partial<Omit<IFsSurface, "realpathSync">> & Required<Pick<IFsSurface, "realpathSync">>) | (Partial<Omit<IFsSurface, "rename">> & Required<Pick<IFsSurface, "rename">>) | (Partial<Omit<IFsSurface, "renameSync">> & Required<Pick<IFsSurface, "renameSync">>) | (Partial<Omit<IFsSurface, "rmSync">> & Required<Pick<IFsSurface, "rmSync">>) | (Partial<Omit<IFsSurface, "rmdirSync">> & Required<Pick<IFsSurface, "rmdirSync">>) | (Partial<Omit<IFsSurface, "stat">> & Required<Pick<IFsSurface, "stat">>) | (Partial<Omit<IFsSurface, "statSync">> & Required<Pick<IFsSurface, "statSync">>) | (Partial<Omit<IFsSurface, "statfsSync">> & Required<Pick<IFsSurface, "statfsSync">>) | (Partial<Omit<IFsSurface, "symlinkSync">> & Required<Pick<IFsSurface, "symlinkSync">>) | (Partial<Omit<IFsSurface, "truncateSync">> & Required<Pick<IFsSurface, "truncateSync">>) | (Partial<Omit<IFsSurface, "unlinkSync">> & Required<Pick<IFsSurface, "unlinkSync">>) | (Partial<Omit<IFsSurface, "utimesSync">> & Required<Pick<IFsSurface, "utimesSync">>) | (Partial<Omit<IFsSurface, "writeFile">> & Required<Pick<IFsSurface, "writeFile">>) | (Partial<Omit<IFsSurface, "writeFileSync">> & Required<Pick<IFsSurface, "writeFileSync">>) | (Partial<Omit<IFsSurface, "writeSync">> & Required<Pick<IFsSurface, "writeSync">>) | (Partial<Omit<IFsSurface, "writevSync">> & Required<Pick<IFsSurface, "writevSync">>)
```

## `ISetFsOptions` (interface)

```text
retryOpen?: boolean | undefined
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
(path: PathLike, mode?: number | undefined): CancelablePromise<void, Unlisted>
```

## `appendFile` (const)

```text
(path: FileHandle | PathLike, data: Uint8Array<ArrayBufferLike> | string, options?: (FlagAndOpenMode & ObjectEncodingOptions & { flush?: boolean | undefined; }) | BufferEncoding | null | undefined): CancelablePromise<void, Unlisted>
```

## `chmod` (const)

```text
(path: PathLike, mode: Mode): CancelablePromise<void, Unlisted>
```

## `chown` (const)

```text
(path: PathLike, uid: number, gid: number): CancelablePromise<void, Unlisted>
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
(src: PathLike, dest: PathLike, mode?: number | undefined): CancelablePromise<void, Unlisted>
```

## `cp` (const)

```text
(source: URL | string, destination: URL | string, opts?: CopyOptions | undefined): CancelablePromise<void, unknown>
```

## `exists` (const)

```text
(path: PathLike): CancelablePromise<boolean, never>
```

## `getFs` (function)

```text
(): IFsLike
```

## `glob` (const)

```text
(pattern: ReadonlyArray<string> | string, options?: undefined | { cwd?: string | undefined; exclude?: ((path: string) => boolean) | undefined; withFileTypes?: boolean | undefined; }): AsyncIterable<string>
```

## `lchmod` (const)

```text
(path: PathLike, mode: Mode): CancelablePromise<void, Unlisted>
```

## `lchown` (const)

```text
(path: PathLike, uid: number, gid: number): CancelablePromise<void, Unlisted>
```

## `link` (const)

```text
(existingPath: PathLike, newPath: PathLike): CancelablePromise<void, Unlisted>
```

## `lstat` (const)

```text
(path: PathLike, opts?: (StatOptions & { bigint?: false | undefined; }) | undefined): CancelablePromise<Stats, Unlisted>
(path: PathLike, opts: StatOptions & { bigint: true; }): CancelablePromise<BigIntStats, Unlisted>
(path: PathLike, opts?: StatOptions | undefined): CancelablePromise<BigIntStats | Stats, Unlisted>
```

## `lutimes` (const)

```text
(path: PathLike, atime: TimeLike, mtime: TimeLike): CancelablePromise<void, Unlisted>
```

## `mkdir` (const)

```text
(path: PathLike, options: MakeDirectoryOptions & { recursive: true; }): CancelablePromise<string | undefined, Unlisted>
(path: PathLike, options?: (MakeDirectoryOptions & { recursive?: false | undefined; }) | Mode | null | undefined): CancelablePromise<void, Unlisted>
(path: PathLike, options?: MakeDirectoryOptions | Mode | null | undefined): CancelablePromise<string | undefined, Unlisted>
```

## `mkdtemp` (const)

```text
(prefix: string, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<string, Unlisted>
(prefix: string, options: BufferEncodingOption): CancelablePromise<NonSharedBuffer, Unlisted>
(prefix: string, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<NonSharedBuffer | string, Unlisted>
```

## `mkdtempDisposable` (const)

```text
(prefix: string, options?: BufferEncoding | null | undefined | { encoding?: BufferEncoding | null | undefined; }): CancelablePromise<IDisposableTempDir, Unlisted>
```

## `open` (const)

```text
(path: PathLike, flags?: number | string | undefined, mode?: Mode | undefined): CancelablePromise<TCancelableFileHandle<FileHandle>, Unlisted>
```

## `opendir` (const)

```text
(path: PathLike, options?: OpenDirOptions | undefined): CancelablePromise<Dir, Unlisted>
```

## `readFile` (const)

```text
(path: FileHandle | PathLike, options?: (Abortable & { encoding?: null | undefined; flag?: OpenMode | undefined; }) | null | undefined): CancelablePromise<NonSharedBuffer, Unlisted>
(path: FileHandle | PathLike, options: (Abortable & { encoding: BufferEncoding; flag?: OpenMode | undefined; }) | BufferEncoding): CancelablePromise<string, Unlisted>
(path: FileHandle | PathLike, options?: (Abortable & ObjectEncodingOptions & { flag?: OpenMode | undefined; }) | BufferEncoding | null | undefined): CancelablePromise<NonSharedBuffer | string, Unlisted>
```

## `readdir` (const)

```text
(path: PathLike, options?: (ObjectEncodingOptions & { withFileTypes?: false | undefined; recursive?: boolean | undefined; }) | BufferEncoding | null | undefined): CancelablePromise<Array<string>, Unlisted>
(path: PathLike, options: "buffer" | { encoding: "buffer"; withFileTypes?: false | undefined; recursive?: boolean | undefined; }): CancelablePromise<Array<NonSharedBuffer>, Unlisted>
(path: PathLike, options?: (ObjectEncodingOptions & { withFileTypes?: false | undefined; recursive?: boolean | undefined; }) | BufferEncoding | null | undefined): CancelablePromise<Array<NonSharedBuffer> | Array<string>, Unlisted>
(path: PathLike, options: ObjectEncodingOptions & { withFileTypes: true; recursive?: boolean | undefined; }): CancelablePromise<Array<Dirent<string>>, Unlisted>
(path: PathLike, options: { encoding: "buffer"; withFileTypes: true; recursive?: boolean | undefined; }): CancelablePromise<Array<Dirent<NonSharedBuffer>>, Unlisted>
```

## `readlink` (const)

```text
(path: PathLike, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<string, Unlisted>
(path: PathLike, options: BufferEncodingOption): CancelablePromise<NonSharedBuffer, Unlisted>
(path: PathLike, options?: ObjectEncodingOptions | null | string | undefined): CancelablePromise<NonSharedBuffer | string, Unlisted>
```

## `realpath` (const)

```text
(path: PathLike, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<string, Unlisted>
(path: PathLike, options: BufferEncodingOption): CancelablePromise<NonSharedBuffer, Unlisted>
(path: PathLike, options?: BufferEncoding | ObjectEncodingOptions | null | undefined): CancelablePromise<NonSharedBuffer | string, Unlisted>
```

## `rename` (const)

```text
(oldPath: PathLike, newPath: PathLike): CancelablePromise<void, Unlisted>
```

## `resetFs` (function)

```text
(): void
```

## `rm` (const)

```text
(path: PathLike, options?: RmOptions | undefined): CancelablePromise<void, Unlisted>
```

## `rmdir` (const)

```text
(path: PathLike, options?: RmDirOptions | undefined): CancelablePromise<void, Unlisted>
```

## `setFs` (function)

```text
(impl: IFsLike, options?: ISetFsOptions | undefined): void
```

## `stat` (const)

```text
(path: PathLike, opts?: (StatOptions & { bigint?: false | undefined; }) | undefined): CancelablePromise<Stats, Unlisted>
(path: PathLike, opts: StatOptions & { bigint: true; }): CancelablePromise<BigIntStats, Unlisted>
(path: PathLike, opts?: StatOptions | undefined): CancelablePromise<BigIntStats | Stats, Unlisted>
```

## `statfs` (const)

```text
(path: PathLike, opts?: (StatFsOptions & { bigint?: false | undefined; }) | undefined): CancelablePromise<StatsFs, Unlisted>
(path: PathLike, opts: StatFsOptions & { bigint: true; }): CancelablePromise<BigIntStatsFs, Unlisted>
(path: PathLike, opts?: StatFsOptions | undefined): CancelablePromise<BigIntStatsFs | StatsFs, Unlisted>
```

## `symlink` (const)

```text
(target: PathLike, path: PathLike, type?: null | string | undefined): CancelablePromise<void, Unlisted>
```

## `truncate` (const)

```text
(path: PathLike, len?: number | undefined): CancelablePromise<void, Unlisted>
```

## `unlink` (const)

```text
(path: PathLike): CancelablePromise<void, Unlisted>
```

## `utimes` (const)

```text
(path: PathLike, atime: TimeLike, mtime: TimeLike): CancelablePromise<void, Unlisted>
```

## `watch` (const)

```text
(filename: PathLike, options: "buffer" | (WatchOptions & { encoding: "buffer"; })): AsyncIterable<FileChangeInfo<NonSharedBuffer>>
(filename: PathLike, options?: BufferEncoding | WatchOptions | undefined): AsyncIterable<FileChangeInfo<string>>
(filename: PathLike, options: WatchOptions | string): AsyncIterable<FileChangeInfo<NonSharedBuffer>> | AsyncIterable<FileChangeInfo<string>>
```

## `writeFile` (const)

```text
(file: FileHandle | PathLike, data: ArrayBufferView<ArrayBufferLike> | AsyncIterable<ArrayBufferView<ArrayBufferLike> | string> | Iterable<ArrayBufferView<ArrayBufferLike> | string> | Stream | string, options?: (Abortable & ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; }) | BufferEncoding | null | undefined): CancelablePromise<void, Unlisted>
```
