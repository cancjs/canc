# Public surface: @cancjs/node ./zlib

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/zlib/index.d.ts`
- Exports: 109

## `BrotliCompress` (class)

```text
extends stream.Transform
new (options?: BrotliOptions | undefined): BrotliCompress
```

## `BrotliDecompress` (class)

```text
extends stream.Transform
new (options?: BrotliOptions | undefined): BrotliDecompress
```

## `BrotliOptions` (interface)

```text
chunkSize?: number | undefined
finishFlush?: number | undefined
flush?: number | undefined
maxOutputLength?: number | undefined
params?: { [key: number]: number | boolean; } | undefined
```

## `CompressCallback` (type)

```text
(error: Error | null, result: NonSharedBuffer): void
```

## `Deflate` (class)

```text
extends stream.Transform
new (options?: ZlibOptions | undefined): Deflate
```

## `DeflateRaw` (class)

```text
extends stream.Transform
new (options?: ZlibOptions | undefined): DeflateRaw
```

## `Gunzip` (class)

```text
extends stream.Transform
new (options?: ZlibOptions | undefined): Gunzip
```

## `Gzip` (class)

```text
extends stream.Transform
new (options?: ZlibOptions | undefined): Gzip
```

## `Inflate` (class)

```text
extends stream.Transform
new (options?: ZlibOptions | undefined): Inflate
```

## `InflateRaw` (class)

```text
extends stream.Transform
new (options?: ZlibOptions | undefined): InflateRaw
```

## `InputType` (type)

```text
string | ArrayBuffer | NodeJS.ArrayBufferView<ArrayBufferLike>
```

## `TIterableCodecFn` (type)

```text
(source: AsyncIterable<InputType> | Iterable<InputType>, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `TZipFilesFn` (type)

```text
(files: ReadonlyArray<string>, target: string, options?: Readonly<Record<string, unknown>> | undefined): CancelablePromise<void, never>
```

## `TZipFilesOptions` (type)

```text
{ readonly [x: string]: unknown; }
```

## `TZstdOptions` (type)

```text
{ readonly [x: string]: unknown; }
```

## `Unzip` (class)

```text
extends stream.Transform
new (options?: ZlibOptions | undefined): Unzip
```

## `Z_ASCII` (const)

```text
// @deprecated
number
```

## `Z_BEST_COMPRESSION` (const)

```text
// @deprecated
number
```

## `Z_BEST_SPEED` (const)

```text
// @deprecated
number
```

## `Z_BINARY` (const)

```text
// @deprecated
number
```

## `Z_BLOCK` (const)

```text
// @deprecated
number
```

## `Z_BUF_ERROR` (const)

```text
// @deprecated
number
```

## `Z_DATA_ERROR` (const)

```text
// @deprecated
number
```

## `Z_DEFAULT_COMPRESSION` (const)

```text
// @deprecated
number
```

## `Z_DEFAULT_STRATEGY` (const)

```text
// @deprecated
number
```

## `Z_DEFLATED` (const)

```text
// @deprecated
number
```

## `Z_ERRNO` (const)

```text
// @deprecated
number
```

## `Z_FILTERED` (const)

```text
// @deprecated
number
```

## `Z_FINISH` (const)

```text
// @deprecated
number
```

## `Z_FIXED` (const)

```text
// @deprecated
number
```

## `Z_FULL_FLUSH` (const)

```text
// @deprecated
number
```

## `Z_HUFFMAN_ONLY` (const)

```text
// @deprecated
number
```

## `Z_MEM_ERROR` (const)

```text
// @deprecated
number
```

## `Z_NEED_DICT` (const)

```text
// @deprecated
number
```

## `Z_NO_COMPRESSION` (const)

```text
// @deprecated
number
```

## `Z_NO_FLUSH` (const)

```text
// @deprecated
number
```

## `Z_OK` (const)

```text
// @deprecated
number
```

## `Z_PARTIAL_FLUSH` (const)

```text
// @deprecated
number
```

## `Z_RLE` (const)

```text
// @deprecated
number
```

## `Z_STREAM_END` (const)

```text
// @deprecated
number
```

## `Z_STREAM_ERROR` (const)

```text
// @deprecated
number
```

## `Z_SYNC_FLUSH` (const)

```text
// @deprecated
number
```

## `Z_TEXT` (const)

```text
// @deprecated
number
```

## `Z_TREES` (const)

```text
// @deprecated
number
```

## `Z_UNKNOWN` (const)

```text
// @deprecated
number
```

## `Z_VERSION_ERROR` (const)

```text
// @deprecated
number
```

## `ZipBuffer` (const)

```text
new (...args: Array<unknown>): object
```

## `Zlib` (interface)

```text
readonly bytesRead: number // @deprecated
readonly bytesWritten: number
close: (callback?: () => void) => void
flush: { (kind?: number, callback?: () => void): void; (callback?: () => void): void; }
shell?: string | boolean | undefined
```

## `ZlibOptions` (interface)

```text
chunkSize?: number | undefined
dictionary?: ArrayBuffer | NodeJS.ArrayBufferView<ArrayBufferLike> | undefined
finishFlush?: number | undefined
flush?: number | undefined
info?: boolean | undefined
level?: number | undefined
maxOutputLength?: number | undefined
memLevel?: number | undefined
strategy?: number | undefined
windowBits?: number | undefined
```

## `ZlibParams` (interface)

```text
params: (level: number, strategy: number, callback: () => void) => void
```

## `ZlibReset` (interface)

```text
reset: () => void
```

## `ZstdCompress` (const)

```text
new (options?: Readonly<Record<string, unknown>> | undefined): Transform
```

## `ZstdDecompress` (const)

```text
new (options?: Readonly<Record<string, unknown>> | undefined): Transform
```

## `brotliCompress` (const)

```text
(data: InputType, options?: BrotliOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `brotliCompressSync` (function)

```text
(buf: InputType, options?: BrotliOptions | undefined): NonSharedBuffer
```

## `brotliDecompress` (const)

```text
(data: InputType, options?: BrotliOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `brotliDecompressSync` (function)

```text
(buf: InputType, options?: BrotliOptions | undefined): NonSharedBuffer
```

## `compressBrotli` (const)

```text
(source: AsyncIterable<InputType> | Iterable<InputType>, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `compressBrotliSync` (const)

```text
(source: Iterable<unknown>, options?: unknown): Buffer<ArrayBufferLike>
```

## `compressDeflate` (const)

```text
(source: AsyncIterable<InputType> | Iterable<InputType>, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `compressDeflateSync` (const)

```text
(source: Iterable<unknown>, options?: unknown): Buffer<ArrayBufferLike>
```

## `compressGzip` (const)

```text
(source: AsyncIterable<InputType> | Iterable<InputType>, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `compressGzipSync` (const)

```text
(source: Iterable<unknown>, options?: unknown): Buffer<ArrayBufferLike>
```

## `compressZstd` (const)

```text
(source: AsyncIterable<InputType> | Iterable<InputType>, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `compressZstdSync` (const)

```text
(source: Iterable<unknown>, options?: unknown): Buffer<ArrayBufferLike>
```

## `constants` (namespace)

```text
BROTLI_DECODE: number
BROTLI_DECODER_ERROR_ALLOC_BLOCK_TYPE_TREES: number
BROTLI_DECODER_ERROR_ALLOC_CONTEXT_MAP: number
BROTLI_DECODER_ERROR_ALLOC_CONTEXT_MODES: number
BROTLI_DECODER_ERROR_ALLOC_RING_BUFFER_1: number
BROTLI_DECODER_ERROR_ALLOC_RING_BUFFER_2: number
BROTLI_DECODER_ERROR_ALLOC_TREE_GROUPS: number
BROTLI_DECODER_ERROR_DICTIONARY_NOT_SET: number
BROTLI_DECODER_ERROR_FORMAT_BLOCK_LENGTH_1: number
BROTLI_DECODER_ERROR_FORMAT_BLOCK_LENGTH_2: number
BROTLI_DECODER_ERROR_FORMAT_CL_SPACE: number
BROTLI_DECODER_ERROR_FORMAT_CONTEXT_MAP_REPEAT: number
BROTLI_DECODER_ERROR_FORMAT_DICTIONARY: number
BROTLI_DECODER_ERROR_FORMAT_DISTANCE: number
BROTLI_DECODER_ERROR_FORMAT_EXUBERANT_META_NIBBLE: number
BROTLI_DECODER_ERROR_FORMAT_EXUBERANT_NIBBLE: number
BROTLI_DECODER_ERROR_FORMAT_HUFFMAN_SPACE: number
BROTLI_DECODER_ERROR_FORMAT_PADDING_1: number
BROTLI_DECODER_ERROR_FORMAT_PADDING_2: number
BROTLI_DECODER_ERROR_FORMAT_RESERVED: number
BROTLI_DECODER_ERROR_FORMAT_SIMPLE_HUFFMAN_ALPHABET: number
BROTLI_DECODER_ERROR_FORMAT_SIMPLE_HUFFMAN_SAME: number
BROTLI_DECODER_ERROR_FORMAT_TRANSFORM: number
BROTLI_DECODER_ERROR_FORMAT_WINDOW_BITS: number
BROTLI_DECODER_ERROR_INVALID_ARGUMENTS: number
BROTLI_DECODER_ERROR_UNREACHABLE: number
BROTLI_DECODER_NEEDS_MORE_INPUT: number
BROTLI_DECODER_NEEDS_MORE_OUTPUT: number
BROTLI_DECODER_NO_ERROR: number
BROTLI_DECODER_PARAM_DISABLE_RING_BUFFER_REALLOCATION: number
BROTLI_DECODER_PARAM_LARGE_WINDOW: number
BROTLI_DECODER_RESULT_ERROR: number
BROTLI_DECODER_RESULT_NEEDS_MORE_INPUT: number
BROTLI_DECODER_RESULT_NEEDS_MORE_OUTPUT: number
BROTLI_DECODER_RESULT_SUCCESS: number
BROTLI_DECODER_SUCCESS: number
BROTLI_DEFAULT_MODE: number
BROTLI_DEFAULT_QUALITY: number
BROTLI_DEFAULT_WINDOW: number
BROTLI_ENCODE: number
BROTLI_LARGE_MAX_WINDOW_BITS: number
BROTLI_MAX_INPUT_BLOCK_BITS: number
BROTLI_MAX_QUALITY: number
BROTLI_MAX_WINDOW_BITS: number
BROTLI_MIN_INPUT_BLOCK_BITS: number
BROTLI_MIN_QUALITY: number
BROTLI_MIN_WINDOW_BITS: number
BROTLI_MODE_FONT: number
BROTLI_MODE_GENERIC: number
BROTLI_MODE_TEXT: number
BROTLI_OPERATION_EMIT_METADATA: number
BROTLI_OPERATION_FINISH: number
BROTLI_OPERATION_FLUSH: number
BROTLI_OPERATION_PROCESS: number
BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING: number
BROTLI_PARAM_LARGE_WINDOW: number
BROTLI_PARAM_LGBLOCK: number
BROTLI_PARAM_LGWIN: number
BROTLI_PARAM_MODE: number
BROTLI_PARAM_NDIRECT: number
BROTLI_PARAM_NPOSTFIX: number
BROTLI_PARAM_QUALITY: number
BROTLI_PARAM_SIZE_HINT: number
DEFLATE: number
DEFLATERAW: number
GUNZIP: number
GZIP: number
INFLATE: number
INFLATERAW: number
UNZIP: number
ZLIB_VERNUM: number
Z_BEST_COMPRESSION: number
Z_BEST_SPEED: number
Z_BLOCK: number
Z_BUF_ERROR: number
Z_DATA_ERROR: number
Z_DEFAULT_CHUNK: number
Z_DEFAULT_COMPRESSION: number
Z_DEFAULT_LEVEL: number
Z_DEFAULT_MEMLEVEL: number
Z_DEFAULT_STRATEGY: number
Z_DEFAULT_WINDOWBITS: number
Z_ERRNO: number
Z_FILTERED: number
Z_FINISH: number
Z_FIXED: number
Z_FULL_FLUSH: number
Z_HUFFMAN_ONLY: number
Z_MAX_CHUNK: number
Z_MAX_LEVEL: number
Z_MAX_MEMLEVEL: number
Z_MAX_WINDOWBITS: number
Z_MEM_ERROR: number
Z_MIN_CHUNK: number
Z_MIN_LEVEL: number
Z_MIN_MEMLEVEL: number
Z_MIN_WINDOWBITS: number
Z_NEED_DICT: number
Z_NO_COMPRESSION: number
Z_NO_FLUSH: number
Z_OK: number
Z_PARTIAL_FLUSH: number
Z_RLE: number
Z_STREAM_END: number
Z_STREAM_ERROR: number
Z_SYNC_FLUSH: number
Z_TREES: number
Z_VERSION_ERROR: number
```

## `crc32` (const)

```text
(data: string | ArrayBufferView<ArrayBufferLike>, value?: number | undefined): number
```

## `createBrotliCompress` (function)

```text
(options?: BrotliOptions | undefined): BrotliCompress
```

## `createBrotliDecompress` (function)

```text
(options?: BrotliOptions | undefined): BrotliDecompress
```

## `createDeflate` (function)

```text
(options?: ZlibOptions | undefined): Deflate
```

## `createDeflateRaw` (function)

```text
(options?: ZlibOptions | undefined): DeflateRaw
```

## `createGunzip` (function)

```text
(options?: ZlibOptions | undefined): Gunzip
```

## `createGzip` (function)

```text
(options?: ZlibOptions | undefined): Gzip
```

## `createInflate` (function)

```text
(options?: ZlibOptions | undefined): Inflate
```

## `createInflateRaw` (function)

```text
(options?: ZlibOptions | undefined): InflateRaw
```

## `createUnzip` (function)

```text
(options?: ZlibOptions | undefined): Unzip
```

## `createZipArchive` (const)

```text
(target: string, options?: Readonly<Record<string, unknown>> | undefined): IZipArchiveWriter
```

## `createZipArchiveSync` (const)

```text
(target: string, options?: Readonly<Record<string, unknown>> | undefined): IZipArchiveWriter
```

## `createZstdCompress` (const)

```text
(options?: Readonly<Record<string, unknown>> | undefined): Transform
```

## `createZstdDecompress` (const)

```text
(options?: Readonly<Record<string, unknown>> | undefined): Transform
```

## `decompressBrotli` (const)

```text
(source: AsyncIterable<InputType> | Iterable<InputType>, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `decompressBrotliSync` (const)

```text
(source: Iterable<unknown>, options?: unknown): Buffer<ArrayBufferLike>
```

## `decompressDeflate` (const)

```text
(source: AsyncIterable<InputType> | Iterable<InputType>, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `decompressDeflateSync` (const)

```text
(source: Iterable<unknown>, options?: unknown): Buffer<ArrayBufferLike>
```

## `decompressGzip` (const)

```text
(source: AsyncIterable<InputType> | Iterable<InputType>, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `decompressGzipSync` (const)

```text
(source: Iterable<unknown>, options?: unknown): Buffer<ArrayBufferLike>
```

## `decompressZstd` (const)

```text
(source: AsyncIterable<InputType> | Iterable<InputType>, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `decompressZstdSync` (const)

```text
(source: Iterable<unknown>, options?: unknown): Buffer<ArrayBufferLike>
```

## `deflate` (const)

```text
(data: InputType, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `deflateRaw` (const)

```text
(data: InputType, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `deflateRawSync` (function)

```text
(buf: InputType, options?: ZlibOptions | undefined): NonSharedBuffer
```

## `deflateSync` (function)

```text
(buf: InputType, options?: ZlibOptions | undefined): NonSharedBuffer
```

## `getMaxZipContentSize` (const)

```text
(): number
```

## `gunzip` (const)

```text
(data: InputType, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `gunzipSync` (function)

```text
(buf: InputType, options?: ZlibOptions | undefined): NonSharedBuffer
```

## `gzip` (const)

```text
(data: InputType, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `gzipSync` (function)

```text
(buf: InputType, options?: ZlibOptions | undefined): NonSharedBuffer
```

## `inflate` (const)

```text
(data: InputType, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `inflateRaw` (const)

```text
(data: InputType, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `inflateRawSync` (function)

```text
(buf: InputType, options?: ZlibOptions | undefined): NonSharedBuffer
```

## `inflateSync` (function)

```text
(buf: InputType, options?: ZlibOptions | undefined): NonSharedBuffer
```

## `setMaxZipContentSize` (const)

```text
(size: number): void
```

## `unzip` (const)

```text
(data: InputType, options?: ZlibOptions | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `unzipSync` (function)

```text
(buf: InputType, options?: ZlibOptions | undefined): NonSharedBuffer
```

## `zipFiles` (const)

```text
(files: ReadonlyArray<string>, target: string, options?: Readonly<Record<string, unknown>> | undefined): CancelablePromise<void, never>
```

## `zstdCompress` (const)

```text
(data: InputType, options?: Readonly<Record<string, unknown>> | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `zstdCompressSync` (const)

```text
(data: unknown, options?: Readonly<Record<string, unknown>> | undefined): Buffer<ArrayBufferLike>
```

## `zstdDecompress` (const)

```text
(data: InputType, options?: Readonly<Record<string, unknown>> | undefined): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `zstdDecompressSync` (const)

```text
(data: unknown, options?: Readonly<Record<string, unknown>> | undefined): Buffer<ArrayBufferLike>
```
