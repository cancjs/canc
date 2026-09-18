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
[iterator]: () => StringIterator<string>
anchor: (name: string) => string
at: (index: number) => string | undefined
big: () => string
blink: () => string
bold: () => string
charAt: (pos: number) => string
charCodeAt: (index: number) => number
codePointAt: (pos: number) => number | undefined
concat: (...strings: string[]) => string
endsWith: (searchString: string, endPosition?: number) => boolean
fixed: () => string
fontcolor: (color: string) => string
fontsize: { (size: number): string; (size: string): string; }
includes: (searchString: string, position?: number) => boolean
indexOf: (searchString: string, position?: number) => number
italics: () => string
lastIndexOf: (searchString: string, position?: number) => number
readonly length: number
link: (url: string) => string
localeCompare: { (that: string): number; (that: string, locales?: string | string[], options?: Intl.CollatorOptions): number; (that: string, locales?: Intl.LocalesArgument, options?: Intl.CollatorOptions): number; }
match: { (regexp: string | RegExp): RegExpMatchArray | null; (matcher: { [Symbol.match](string: string): RegExpMatchArray | null; }): RegExpMatchArray | null; }
matchAll: (regexp: RegExp) => RegExpStringIterator<RegExpExecArray>
normalize: { (form: "NFC" | "NFD" | "NFKC" | "NFKD"): string; (form?: string): string; }
padEnd: (maxLength: number, fillString?: string) => string
padStart: (maxLength: number, fillString?: string) => string
repeat: (count: number) => string
replace: { (searchValue: string | RegExp, replaceValue: string): string; (searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string; (searchValue: { [Symbol.replace](string: string, replaceValue: string): string; }, replaceValue: string): string; (searchValue: { [Symbol.replace](string: string, replacer: (substring: string, ...args: any[]) => string): string; }, replacer: (substring: string, ...args: any[]) => string): string; }
replaceAll: { (searchValue: string | RegExp, replaceValue: string): string; (searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string; }
search: { (regexp: string | RegExp): number; (searcher: { [Symbol.search](string: string): number; }): number; }
slice: (start?: number, end?: number) => string
small: () => string
split: { (separator: string | RegExp, limit?: number): string[]; (splitter: { [Symbol.split](string: string, limit?: number): string[]; }, limit?: number): string[]; }
startsWith: (searchString: string, position?: number) => boolean
strike: () => string
sub: () => string
substr: (from: number, length?: number) => string
substring: (start: number, end?: number) => string
sup: () => string
toLocaleLowerCase: { (locales?: string | string[]): string; (locales?: Intl.LocalesArgument): string; }
toLocaleUpperCase: { (locales?: string | string[]): string; (locales?: Intl.LocalesArgument): string; }
toLowerCase: () => string
toString: () => string
toUpperCase: () => string
trim: () => string
trimEnd: () => string
trimLeft: () => string
trimRight: () => string
trimStart: () => string
valueOf: () => string
```

## `TWalkOrder` (type)

```text
[iterator]: () => StringIterator<string>
anchor: (name: string) => string
at: (index: number) => string | undefined
big: () => string
blink: () => string
bold: () => string
charAt: (pos: number) => string
charCodeAt: (index: number) => number
codePointAt: (pos: number) => number | undefined
concat: (...strings: string[]) => string
endsWith: (searchString: string, endPosition?: number) => boolean
fixed: () => string
fontcolor: (color: string) => string
fontsize: { (size: number): string; (size: string): string; }
includes: (searchString: string, position?: number) => boolean
indexOf: (searchString: string, position?: number) => number
italics: () => string
lastIndexOf: (searchString: string, position?: number) => number
readonly length: number
link: (url: string) => string
localeCompare: { (that: string): number; (that: string, locales?: string | string[], options?: Intl.CollatorOptions): number; (that: string, locales?: Intl.LocalesArgument, options?: Intl.CollatorOptions): number; }
match: { (regexp: string | RegExp): RegExpMatchArray | null; (matcher: { [Symbol.match](string: string): RegExpMatchArray | null; }): RegExpMatchArray | null; }
matchAll: (regexp: RegExp) => RegExpStringIterator<RegExpExecArray>
normalize: { (form: "NFC" | "NFD" | "NFKC" | "NFKD"): string; (form?: string): string; }
padEnd: (maxLength: number, fillString?: string) => string
padStart: (maxLength: number, fillString?: string) => string
repeat: (count: number) => string
replace: { (searchValue: string | RegExp, replaceValue: string): string; (searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string; (searchValue: { [Symbol.replace](string: string, replaceValue: string): string; }, replaceValue: string): string; (searchValue: { [Symbol.replace](string: string, replacer: (substring: string, ...args: any[]) => string): string; }, replacer: (substring: string, ...args: any[]) => string): string; }
replaceAll: { (searchValue: string | RegExp, replaceValue: string): string; (searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string; }
search: { (regexp: string | RegExp): number; (searcher: { [Symbol.search](string: string): number; }): number; }
slice: (start?: number, end?: number) => string
small: () => string
split: { (separator: string | RegExp, limit?: number): string[]; (splitter: { [Symbol.split](string: string, limit?: number): string[]; }, limit?: number): string[]; }
startsWith: (searchString: string, position?: number) => boolean
strike: () => string
sub: () => string
substr: (from: number, length?: number) => string
substring: (start: number, end?: number) => string
sup: () => string
toLocaleLowerCase: { (locales?: string | string[]): string; (locales?: Intl.LocalesArgument): string; }
toLocaleUpperCase: { (locales?: string | string[]): string; (locales?: Intl.LocalesArgument): string; }
toLowerCase: () => string
toString: () => string
toUpperCase: () => string
trim: () => string
trimEnd: () => string
trimLeft: () => string
trimRight: () => string
trimStart: () => string
valueOf: () => string
```

## `copy` (function)

```text
(src: string, dest: string, options?: ICopyOptions | undefined): CancelablePromise<void>
```

## `emptyDir` (function)

```text
(dir: string): CancelablePromise<void>
```

## `emptyDirSync` (function)

```text
(dir: string): void
```

## `ensureDir` (function)

```text
(path: string): CancelablePromise<void>
```

## `ensureDirSync` (function)

```text
(path: string): void
```

## `ensureFile` (function)

```text
(path: string): CancelablePromise<void>
```

## `ensureFileSync` (function)

```text
(path: string): void
```

## `ensureLink` (function)

```text
(srcPath: string, dstPath: string): CancelablePromise<void>
```

## `ensureLinkSync` (function)

```text
(srcPath: string, dstPath: string): void
```

## `ensureSymlink` (function)

```text
(srcPath: string, dstPath: string, type?: string | undefined): CancelablePromise<void>
```

## `ensureSymlinkSync` (function)

```text
(srcPath: string, dstPath: string, type?: Type | null | undefined): void
```

## `mkdirp` (const)

```text
(path: string): CancelablePromise<void>
```

## `mkdirpSync` (const)

```text
(path: string): void
```

## `mkdirs` (const)

```text
(path: string): CancelablePromise<void>
```

## `mkdirsSync` (const)

```text
(path: string): void
```

## `move` (function)

```text
(src: string, dest: string, options?: IMoveOptions | undefined): CancelablePromise<void>
```

## `moveSync` (function)

```text
(src: string, dest: string, options?: IMoveOptions | undefined): void
```

## `outputFile` (function)

```text
(path: string, data: string | Stream | ArrayBufferView<ArrayBufferLike> | Iterable<string | ArrayBufferView<ArrayBufferLike>> | AsyncIterable<string | ArrayBufferView<ArrayBufferLike>>, options?: BufferEncoding | (ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; } & Abortable) | null | undefined): CancelablePromise<void>
```

## `outputFileSync` (function)

```text
(path: string, data: string | ArrayBufferView<ArrayBufferLike>, options?: WriteFileOptions | undefined): void
```

## `outputJson` (function)

```text
(file: string, data: unknown, options?: BufferEncoding | IWriteJsonOptions | null | undefined): CancelablePromise<void>
```

## `outputJsonSync` (function)

```text
(file: string, data: unknown, options?: BufferEncoding | IWriteJsonOptions | null | undefined): void
```

## `pathExists` (const)

```text
(path: PathLike): CancelablePromise<boolean>
```

## `readJson<T = any>` (function)

```text
<T = any>(file: string, options: IReadJsonOptions & { throws: false; }): CancelablePromise<T | null>
<T = any>(file: string, options?: BufferEncoding | IReadJsonOptions | null | undefined): CancelablePromise<T>
```

## `readJsonSync<T = any>` (function)

```text
<T = any>(file: string, options: IReadJsonOptions & { throws: false; }): T | null
<T = any>(file: string, options?: BufferEncoding | IReadJsonOptions | null | undefined): T
```

## `replaceFile` (function)

```text
(path: string, data: string | Stream | ArrayBufferView<ArrayBufferLike> | Iterable<string | ArrayBufferView<ArrayBufferLike>> | AsyncIterable<string | ArrayBufferView<ArrayBufferLike>>, options?: BufferEncoding | (ObjectEncodingOptions & { mode?: Mode | undefined; flag?: OpenMode | undefined; flush?: boolean | undefined; } & Abortable) | null | undefined): CancelablePromise<void>
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
(file: string, object: unknown, options?: BufferEncoding | IWriteJsonOptions | null | undefined): CancelablePromise<void>
```

## `writeJsonSync` (function)

```text
(file: string, object: unknown, options?: BufferEncoding | IWriteJsonOptions | null | undefined): void
```
