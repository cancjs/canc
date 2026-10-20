import type { Transform } from 'node:stream';
import nodeZlib from 'node:zlib';

import {
  TBrotliBufferFn,
  TCreateZipArchiveFn,
  TCreateZipArchiveSyncFn,
  TIterableCodecFn,
  TZipFilesFn,
  TZlibBufferFn,
  TZstdBufferFn,
  TZstdOptions,
} from './types';
import { gatedClassWrapped, gatedWrapped, iterableCodecWrapped, promisifyWrapped, TNodeFn } from './wrap';

// node's callback surface is read through one untyped view so each binding below can re-impose its
// own published shape on the way out, same boundary cast as ../crypto/index.ts
const zlibCb = nodeZlib as unknown as Record<string, TNodeFn>;

/**
 * Whether `name` exists as a function on the running runtime's `node:zlib`. Feature-detecting the
 * export itself, rather than parsing `process.versions.node`, is what lets a runtime implementing
 * the node API without claiming that version still get a feature it actually ships.
 */
const has = (name: string): boolean => typeof zlibCb[name] === 'function';

/**
 * The iterable codec module. Node keeps these codecs in `node:zlib/iter`, not on `node:zlib`: since
 * 25.9.0, or behind `--experimental-stream-iter` on 24.x. Resolved once at load through
 * `process.getBuiltinModule`, not a static import, so a runtime without the module still loads `zlib`.
 */
const iterZlib = ((process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule?.(
  'node:zlib/iter',
) ?? {}) as Record<string, TNodeFn>;

const hasIter = (name: string): boolean => typeof iterZlib[name] === 'function';

/**
 * Compresses `data` with brotli.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const brotliCompress = promisifyWrapped(zlibCb.brotliCompress) as TBrotliBufferFn;

/**
 * Decompresses brotli-compressed `data`.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const brotliDecompress = promisifyWrapped(zlibCb.brotliDecompress) as TBrotliBufferFn;

/**
 * Compresses `data` with deflate.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const deflate = promisifyWrapped(zlibCb.deflate) as TZlibBufferFn;

/**
 * Compresses `data` with raw deflate (no zlib header/trailer).
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const deflateRaw = promisifyWrapped(zlibCb.deflateRaw) as TZlibBufferFn;

/**
 * Compresses `data` with gzip.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const gzip = promisifyWrapped(zlibCb.gzip) as TZlibBufferFn;

/**
 * Decompresses gzip-compressed `data`.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const gunzip = promisifyWrapped(zlibCb.gunzip) as TZlibBufferFn;

/**
 * Decompresses zlib-compressed `data`.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const inflate = promisifyWrapped(zlibCb.inflate) as TZlibBufferFn;

/**
 * Decompresses raw-deflate-compressed `data` (no zlib header/trailer expected).
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const inflateRaw = promisifyWrapped(zlibCb.inflateRaw) as TZlibBufferFn;

/**
 * Decompresses `data`, detecting gzip or zlib framing automatically.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const unzip = promisifyWrapped(zlibCb.unzip) as TZlibBufferFn;

/**
 * Compresses `data` with zstd. Requires Node 22.15 or later; throws `NotImplementedError` below that,
 * driven by feature detection rather than a version parse.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const zstdCompress = gatedWrapped(
  has('zstdCompress'),
  'zstdCompress',
  '22.15.0',
  () => promisifyWrapped(zlibCb.zstdCompress),
  'promise',
) as TZstdBufferFn;

/**
 * Decompresses zstd-compressed `data`. Requires Node 22.15 or later; throws `NotImplementedError` below
 * that, driven by feature detection rather than a version parse.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const zstdDecompress = gatedWrapped(
  has('zstdDecompress'),
  'zstdDecompress',
  '22.15.0',
  () => promisifyWrapped(zlibCb.zstdDecompress),
  'promise',
) as TZstdBufferFn;

/**
 * Computes a CRC-32 checksum. Requires Node 20.15 or later; throws `NotImplementedError` below that,
 * driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const crc32 = gatedWrapped(
  has('crc32'),
  'crc32',
  '20.15.0',
  () => zlibCb.crc32 as (data: unknown, value?: number) => number,
  'sync',
) as (data: string | NodeJS.ArrayBufferView, value?: number) => number;

/**
 * Synchronously compresses `data` with zstd. Requires Node 22.15 or later; throws `NotImplementedError`
 * below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const zstdCompressSync = gatedWrapped(
  has('zstdCompressSync'),
  'zstdCompressSync',
  '22.15.0',
  () => zlibCb.zstdCompressSync as (data: unknown, options?: TZstdOptions) => Buffer,
  'sync',
) as (data: unknown, options?: TZstdOptions) => Buffer;

/**
 * Synchronously decompresses zstd-compressed `data`. Requires Node 22.15 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const zstdDecompressSync = gatedWrapped(
  has('zstdDecompressSync'),
  'zstdDecompressSync',
  '22.15.0',
  () => zlibCb.zstdDecompressSync as (data: unknown, options?: TZstdOptions) => Buffer,
  'sync',
) as (data: unknown, options?: TZstdOptions) => Buffer;

/**
 * Opens a zstd compression transform stream. Requires Node 22.15 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * `destroy()` on the returned stream genuinely stops it; unlike the one-shot buffer form of the same
 * codec above, this shape has always been fully stoppable.
 */
export const createZstdCompress = gatedWrapped(
  has('createZstdCompress'),
  'createZstdCompress',
  '22.15.0',
  () => zlibCb.createZstdCompress as (options?: TZstdOptions) => Transform,
  'sync',
) as (options?: TZstdOptions) => Transform;

/**
 * Opens a zstd decompression transform stream. Requires Node 22.15 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * `destroy()` on the returned stream genuinely stops it; unlike the one-shot buffer form of the same
 * codec above, this shape has always been fully stoppable.
 */
export const createZstdDecompress = gatedWrapped(
  has('createZstdDecompress'),
  'createZstdDecompress',
  '22.15.0',
  () => zlibCb.createZstdDecompress as (options?: TZstdOptions) => Transform,
  'sync',
) as (options?: TZstdOptions) => Transform;

/**
 * The zstd compression transform stream class. Requires Node 22.15 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 */
export const ZstdCompress = gatedClassWrapped(
  has('ZstdCompress'),
  'ZstdCompress',
  '22.15.0',
  () => zlibCb.ZstdCompress as unknown as new (options?: TZstdOptions) => Transform,
);

/**
 * The zstd decompression transform stream class. Requires Node 22.15 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 */
export const ZstdDecompress = gatedClassWrapped(
  has('ZstdDecompress'),
  'ZstdDecompress',
  '22.15.0',
  () => zlibCb.ZstdDecompress as unknown as new (options?: TZstdOptions) => Transform,
);

/**
 * Compresses an iterable or async iterable of chunks with gzip, resolving one `Buffer`. Requires
 * Node 25.9 or later; throws `NotImplementedError` below that, driven by feature detection rather than
 * a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const compressGzip = gatedWrapped(
  hasIter('compressGzip'),
  'compressGzip',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterableCodecWrapped<Buffer>(iterZlib.compressGzip),
  'promise',
) as TIterableCodecFn;

/**
 * Decompresses an iterable or async iterable of gzip-compressed chunks, resolving one `Buffer`.
 * Requires Node 25.9 or later; throws `NotImplementedError` below that, driven by feature detection
 * rather than a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const decompressGzip = gatedWrapped(
  hasIter('decompressGzip'),
  'decompressGzip',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterableCodecWrapped<Buffer>(iterZlib.decompressGzip),
  'promise',
) as TIterableCodecFn;

/**
 * Compresses an iterable or async iterable of chunks with deflate, resolving one `Buffer`. Requires
 * Node 25.9 or later; throws `NotImplementedError` below that, driven by feature detection rather than
 * a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const compressDeflate = gatedWrapped(
  hasIter('compressDeflate'),
  'compressDeflate',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterableCodecWrapped<Buffer>(iterZlib.compressDeflate),
  'promise',
) as TIterableCodecFn;

/**
 * Decompresses an iterable or async iterable of deflate-compressed chunks, resolving one `Buffer`.
 * Requires Node 25.9 or later; throws `NotImplementedError` below that, driven by feature detection
 * rather than a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const decompressDeflate = gatedWrapped(
  hasIter('decompressDeflate'),
  'decompressDeflate',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterableCodecWrapped<Buffer>(iterZlib.decompressDeflate),
  'promise',
) as TIterableCodecFn;

/**
 * Compresses an iterable or async iterable of chunks with brotli, resolving one `Buffer`. Requires
 * Node 25.9 or later; throws `NotImplementedError` below that, driven by feature detection rather than
 * a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const compressBrotli = gatedWrapped(
  hasIter('compressBrotli'),
  'compressBrotli',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterableCodecWrapped<Buffer>(iterZlib.compressBrotli),
  'promise',
) as TIterableCodecFn;

/**
 * Decompresses an iterable or async iterable of brotli-compressed chunks, resolving one `Buffer`.
 * Requires Node 25.9 or later; throws `NotImplementedError` below that, driven by feature detection
 * rather than a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const decompressBrotli = gatedWrapped(
  hasIter('decompressBrotli'),
  'decompressBrotli',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterableCodecWrapped<Buffer>(iterZlib.decompressBrotli),
  'promise',
) as TIterableCodecFn;

/**
 * Compresses an iterable or async iterable of chunks with zstd, resolving one `Buffer`. Requires
 * Node 25.9 or later; throws `NotImplementedError` below that, driven by feature detection rather than
 * a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const compressZstd = gatedWrapped(
  hasIter('compressZstd'),
  'compressZstd',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterableCodecWrapped<Buffer>(iterZlib.compressZstd),
  'promise',
) as TIterableCodecFn;

/**
 * Decompresses an iterable or async iterable of zstd-compressed chunks, resolving one `Buffer`.
 * Requires Node 25.9 or later; throws `NotImplementedError` below that, driven by feature detection
 * rather than a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const decompressZstd = gatedWrapped(
  hasIter('decompressZstd'),
  'decompressZstd',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterableCodecWrapped<Buffer>(iterZlib.decompressZstd),
  'promise',
) as TIterableCodecFn;

/**
 * Synchronous counterpart of {@link compressGzip}. Requires Node 25.9 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const compressGzipSync = gatedWrapped(
  hasIter('compressGzipSync'),
  'compressGzipSync',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterZlib.compressGzipSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link decompressGzip}. Requires Node 25.9 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const decompressGzipSync = gatedWrapped(
  hasIter('decompressGzipSync'),
  'decompressGzipSync',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterZlib.decompressGzipSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link compressDeflate}. Requires Node 25.9 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const compressDeflateSync = gatedWrapped(
  hasIter('compressDeflateSync'),
  'compressDeflateSync',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterZlib.compressDeflateSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link decompressDeflate}. Requires Node 25.9 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const decompressDeflateSync = gatedWrapped(
  hasIter('decompressDeflateSync'),
  'decompressDeflateSync',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterZlib.decompressDeflateSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link compressBrotli}. Requires Node 25.9 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const compressBrotliSync = gatedWrapped(
  hasIter('compressBrotliSync'),
  'compressBrotliSync',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterZlib.compressBrotliSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link decompressBrotli}. Requires Node 25.9 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const decompressBrotliSync = gatedWrapped(
  hasIter('decompressBrotliSync'),
  'decompressBrotliSync',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterZlib.decompressBrotliSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link compressZstd}. Requires Node 25.9 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const compressZstdSync = gatedWrapped(
  hasIter('compressZstdSync'),
  'compressZstdSync',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterZlib.compressZstdSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link decompressZstd}. Requires Node 25.9 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const decompressZstdSync = gatedWrapped(
  hasIter('decompressZstdSync'),
  'decompressZstdSync',
  '25.9.0 (or --experimental-stream-iter)',
  () => iterZlib.decompressZstdSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * The in-memory zip archive builder. Requires Node 26.8 or later; throws `NotImplementedError` below
 * that, driven by feature detection rather than a version parse.
 */
export const ZipBuffer = gatedClassWrapped(
  has('ZipBuffer'),
  'ZipBuffer',
  '26.8.0',
  () => zlibCb.ZipBuffer as unknown as new (...args: unknown[]) => object,
);

/**
 * Builds a zip archive from `ZipEntry` values and returns node's own `Readable` of its bytes, same
 * signature and return as node's `createZipArchive`. Requires Node 26.8 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * There is no promise to cancel: destroying the returned stream is the cancel.
 */
export const createZipArchive = gatedWrapped(
  has('createZipArchive'),
  'createZipArchive',
  '26.8.0',
  () => zlibCb.createZipArchive as TCreateZipArchiveFn,
  'sync',
) as TCreateZipArchiveFn;

/**
 * Synchronous counterpart of {@link createZipArchive}: returns node's iterator of archive chunks.
 * Requires Node 26.8 or later; throws `NotImplementedError` below that, driven by feature detection
 * rather than a version parse.
 */
export const createZipArchiveSync = gatedWrapped(
  has('createZipArchiveSync'),
  'createZipArchiveSync',
  '26.8.0',
  () => zlibCb.createZipArchiveSync as TCreateZipArchiveSyncFn,
  'sync',
) as TCreateZipArchiveSyncFn;

/**
 * Reads the configured maximum decompressed entry size for zip extraction. Requires Node 26.8 or
 * later; throws `NotImplementedError` below that, driven by feature detection rather than a version
 * parse.
 */
export const getMaxZipContentSize = gatedWrapped(
  has('getMaxZipContentSize'),
  'getMaxZipContentSize',
  '26.8.0',
  () => zlibCb.getMaxZipContentSize as () => number,
  'sync',
) as () => number;

/**
 * Sets the configured maximum decompressed entry size for zip extraction. Requires Node 26.8 or later;
 * throws `NotImplementedError` below that, driven by feature detection rather than a version parse.
 */
export const setMaxZipContentSize = gatedWrapped(
  has('setMaxZipContentSize'),
  'setMaxZipContentSize',
  '26.8.0',
  () => zlibCb.setMaxZipContentSize as (size: number) => void,
  'sync',
) as (size: number) => void;

/**
 * Builds a zip archive from `[sourcePath, entryName]` pairs and returns node's own `Readable` of its
 * bytes, same signature and return as node's `zipFiles`. Requires Node 26.8 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * There is no promise to cancel: destroying the returned stream is the cancel.
 */
export const zipFiles = gatedWrapped(
  has('zipFiles'),
  'zipFiles',
  '26.8.0',
  () => zlibCb.zipFiles as TZipFilesFn,
  'sync',
) as TZipFilesFn;

export type {
  TCreateZipArchiveFn,
  TCreateZipArchiveSyncFn,
  TIterableCodecFn,
  TZipArchiveOptions,
  TZipFilesFn,
  TZipFilesOptions,
  TZstdOptions,
} from './types';

// the synchronous factory surface (createGzip, createInflate, the plain codec classes, constants,
// and every *Sync buffer codec that has no version gate) passes through untouched, so a caller
// building a pipeline is not forced into a second import for one operation; the wrapped and gated
// bindings above are declared locally and win over this star re-export for every name they share,
// per the language's own name resolution rather than any ordering trick
export * from 'node:zlib';
