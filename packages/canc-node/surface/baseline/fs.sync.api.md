# Public surface: @cancjs/node ./fs/sync

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/fs/sync.d.ts`
- Exports: 46

## `Dir` (const)

```text
new (): Dir
```

## `Dirent` (const)

```text
new <Name extends string | Buffer = string>(): Dirent<Name>
```

## `Stats` (const)

```text
new (): Stats
```

## `accessSync` (const)

```text
(path: PathLike, mode?: number | undefined): void
```

## `appendFileSync` (const)

```text
(path: PathOrFileDescriptor, data: string | Uint8Array<ArrayBufferLike>, options?: WriteFileOptions | undefined): void
```

## `chmodSync` (const)

```text
(path: PathLike, mode: Mode): void
```

## `chownSync` (const)

```text
(path: PathLike, uid: number, gid: number): void
```

## `closeSync` (const)

```text
(fd: number): void
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

## `copyFileSync` (const)

```text
(src: PathLike, dest: PathLike, mode?: number | undefined): void
```

## `cpSync` (const)

```text
(source: string | URL, destination: string | URL, opts?: CopySyncOptions | undefined): void
```

## `existsSync` (const)

```text
(path: PathLike): boolean
```

## `fchmodSync` (const)

```text
(fd: number, mode: Mode): void
```

## `fchownSync` (const)

```text
(fd: number, uid: number, gid: number): void
```

## `fdatasyncSync` (const)

```text
(fd: number): void
```

## `fstatSync` (const)

```text
(fd: number, options?: (StatOptions & { bigint?: false | undefined; }) | undefined): Stats
(fd: number, options: StatOptions & { bigint: true; }): BigIntStats
(fd: number, options?: StatOptions | undefined): Stats | BigIntStats
```

## `fsyncSync` (const)

```text
(fd: number): void
```

## `ftruncateSync` (const)

```text
(fd: number, len?: number | undefined): void
```

## `futimesSync` (const)

```text
(fd: number, atime: TimeLike, mtime: TimeLike): void
```

## `lchmodSync` (const)

```text
(path: PathLike, mode: Mode): void // @deprecated
```

## `lchownSync` (const)

```text
(path: PathLike, uid: number, gid: number): void
```

## `linkSync` (const)

```text
(existingPath: PathLike, newPath: PathLike): void
```

## `lstatSync` (const)

```text
(path: PathLike, options?: undefined): Stats
(path: PathLike, options?: (StatSyncOptions & { bigint?: false | undefined; throwIfNoEntry: false; }) | undefined): Stats | undefined
(path: PathLike, options: StatSyncOptions & { bigint: true; throwIfNoEntry: false; }): BigIntStats | undefined
(path: PathLike, options?: (StatSyncOptions & { bigint?: false | undefined; }) | undefined): Stats
(path: PathLike, options: StatSyncOptions & { bigint: true; }): BigIntStats
(path: PathLike, options: StatSyncOptions & { bigint: boolean; throwIfNoEntry?: false | undefined; }): Stats | BigIntStats
(path: PathLike, options?: StatSyncOptions | undefined): Stats | BigIntStats | undefined
```

## `lutimesSync` (const)

```text
(path: PathLike, atime: TimeLike, mtime: TimeLike): void
```

## `mkdirSync` (const)

```text
(path: PathLike, options: MakeDirectoryOptions & { recursive: true; }): string | undefined
(path: PathLike, options?: Mode | (MakeDirectoryOptions & { recursive?: false | undefined; }) | null | undefined): void
(path: PathLike, options?: Mode | MakeDirectoryOptions | null | undefined): string | undefined
```

## `mkdtempSync` (const)

```text
(prefix: string, options?: EncodingOption): string
(prefix: string, options: BufferEncodingOption): NonSharedBuffer
(prefix: string, options?: EncodingOption): string | NonSharedBuffer
```

## `openSync` (const)

```text
(path: PathLike, flags: OpenMode, mode?: Mode | null | undefined): number
```

## `opendirSync` (const)

```text
(path: PathLike, options?: OpenDirOptions | undefined): Dir
```

## `readFileSync` (const)

```text
(path: PathOrFileDescriptor, options?: { encoding?: null | undefined; flag?: string | undefined; } | null | undefined): NonSharedBuffer
(path: PathOrFileDescriptor, options: BufferEncoding | { encoding: BufferEncoding; flag?: string | undefined; }): string
(path: PathOrFileDescriptor, options?: BufferEncoding | (ObjectEncodingOptions & { flag?: string | undefined; }) | null | undefined): string | NonSharedBuffer
```

## `readSync` (const)

```text
(fd: number, buffer: ArrayBufferView<ArrayBufferLike>, offset: number, length: number, position: ReadPosition | null): number
(fd: number, buffer: ArrayBufferView<ArrayBufferLike>, opts?: ReadOptions | undefined): number
```

## `readdirSync` (const)

```text
(path: PathLike, options?: BufferEncoding | { encoding: BufferEncoding | null; withFileTypes?: false | undefined; recursive?: boolean | undefined; } | null | undefined): Array<string>
(path: PathLike, options: "buffer" | { encoding: "buffer"; withFileTypes?: false | undefined; recursive?: boolean | undefined; }): Array<NonSharedBuffer>
(path: PathLike, options?: BufferEncoding | (ObjectEncodingOptions & { withFileTypes?: false | undefined; recursive?: boolean | undefined; }) | null | undefined): Array<string> | Array<NonSharedBuffer>
(path: PathLike, options: ObjectEncodingOptions & { withFileTypes: true; recursive?: boolean | undefined; }): Array<Dirent<string>>
(path: PathLike, options: { encoding: "buffer"; withFileTypes: true; recursive?: boolean | undefined; }): Array<Dirent<NonSharedBuffer>>
```

## `readlinkSync` (const)

```text
(path: PathLike, options?: EncodingOption): string
(path: PathLike, options: BufferEncodingOption): NonSharedBuffer
(path: PathLike, options?: EncodingOption): string | NonSharedBuffer
```

## `readvSync` (const)

```text
(fd: number, buffers: ReadonlyArray<ArrayBufferView<ArrayBufferLike>>, position?: number | undefined): number
```

## `realpathSync` (const)

```text
(path: PathLike, options?: EncodingOption): string
(path: PathLike, options: BufferEncodingOption): NonSharedBuffer
(path: PathLike, options?: EncodingOption): string | NonSharedBuffer
```

## `renameSync` (const)

```text
(oldPath: PathLike, newPath: PathLike): void
```

## `rmSync` (const)

```text
(path: PathLike, options?: RmOptions | undefined): void
```

## `rmdirSync` (const)

```text
(path: PathLike, options?: RmDirOptions | undefined): void
```

## `statSync` (const)

```text
(path: PathLike, options?: undefined): Stats
(path: PathLike, options?: (StatSyncOptions & { bigint?: false | undefined; throwIfNoEntry: false; }) | undefined): Stats | undefined
(path: PathLike, options: StatSyncOptions & { bigint: true; throwIfNoEntry: false; }): BigIntStats | undefined
(path: PathLike, options?: (StatSyncOptions & { bigint?: false | undefined; }) | undefined): Stats
(path: PathLike, options: StatSyncOptions & { bigint: true; }): BigIntStats
(path: PathLike, options: StatSyncOptions & { bigint: boolean; throwIfNoEntry?: false | undefined; }): Stats | BigIntStats
(path: PathLike, options?: StatSyncOptions | undefined): Stats | BigIntStats | undefined
```

## `statfsSync` (const)

```text
(path: PathLike, options?: (StatFsOptions & { bigint?: false | undefined; }) | undefined): StatsFs
(path: PathLike, options: StatFsOptions & { bigint: true; }): BigIntStatsFs
(path: PathLike, options?: StatFsOptions | undefined): StatsFs | BigIntStatsFs
```

## `symlinkSync` (const)

```text
(target: PathLike, path: PathLike, type?: Type | null | undefined): void
```

## `truncateSync` (const)

```text
(path: PathLike, len?: number | undefined): void
```

## `unlinkSync` (const)

```text
(path: PathLike): void
```

## `utimesSync` (const)

```text
(path: PathLike, atime: TimeLike, mtime: TimeLike): void
```

## `writeFileSync` (const)

```text
(file: PathOrFileDescriptor, data: string | ArrayBufferView<ArrayBufferLike>, options?: WriteFileOptions | undefined): void
```

## `writeSync` (const)

```text
(fd: number, buffer: ArrayBufferView<ArrayBufferLike>, offset?: number | null | undefined, length?: number | null | undefined, position?: number | null | undefined): number
(fd: number, string: string, position?: number | null | undefined, encoding?: BufferEncoding | null | undefined): number
```

## `writevSync` (const)

```text
(fd: number, buffers: ReadonlyArray<ArrayBufferView<ArrayBufferLike>>, position?: number | undefined): number
```
