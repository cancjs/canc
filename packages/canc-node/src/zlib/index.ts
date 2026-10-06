import type { Transform } from 'node:stream';
import nodeZlib from 'node:zlib';

import { CancelablePromise } from '@cancjs/promise';

import {
  TBrotliBufferFn,
  TIterableCodecFn,
  TZipFilesFn,
  TZipFilesOptions,
  TZlibBufferFn,
  TZstdBufferFn,
  TZstdOptions,
} from './types';
import {
  checkpointWalkWrapped,
  gatedClassWrapped,
  gatedWrapped,
  iterableCodecWrapped,
  promisifyWrapped,
  TNodeFn,
} from './wrap';

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
 * Compresses `data` with zstd. Requires Node 22 or later; throws `NotImplementedError` below that,
 * driven by feature detection rather than a version parse.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const zstdCompress = gatedWrapped(
  has('zstdCompress'),
  'zstdCompress',
  '22',
  () => promisifyWrapped(zlibCb.zstdCompress),
  'promise',
) as TZstdBufferFn;

/**
 * Decompresses zstd-compressed `data`. Requires Node 22 or later; throws `NotImplementedError` below
 * that, driven by feature detection rather than a version parse.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const zstdDecompress = gatedWrapped(
  has('zstdDecompress'),
  'zstdDecompress',
  '22',
  () => promisifyWrapped(zlibCb.zstdDecompress),
  'promise',
) as TZstdBufferFn;

/**
 * Computes a CRC-32 checksum. Requires Node 22 or later; throws `NotImplementedError` below that,
 * driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const crc32 = gatedWrapped(
  has('crc32'),
  'crc32',
  '22',
  () => zlibCb.crc32 as (data: unknown, value?: number) => number,
  'sync',
) as (data: string | NodeJS.ArrayBufferView, value?: number) => number;

/**
 * Synchronously compresses `data` with zstd. Requires Node 22 or later; throws `NotImplementedError`
 * below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const zstdCompressSync = gatedWrapped(
  has('zstdCompressSync'),
  'zstdCompressSync',
  '22',
  () => zlibCb.zstdCompressSync as (data: unknown, options?: TZstdOptions) => Buffer,
  'sync',
) as (data: unknown, options?: TZstdOptions) => Buffer;

/**
 * Synchronously decompresses zstd-compressed `data`. Requires Node 22 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const zstdDecompressSync = gatedWrapped(
  has('zstdDecompressSync'),
  'zstdDecompressSync',
  '22',
  () => zlibCb.zstdDecompressSync as (data: unknown, options?: TZstdOptions) => Buffer,
  'sync',
) as (data: unknown, options?: TZstdOptions) => Buffer;

/**
 * Opens a zstd compression transform stream. Requires Node 22 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * `destroy()` on the returned stream genuinely stops it; unlike the one-shot buffer form of the same
 * codec above, this shape has always been fully stoppable.
 */
export const createZstdCompress = gatedWrapped(
  has('createZstdCompress'),
  'createZstdCompress',
  '22',
  () => zlibCb.createZstdCompress as (options?: TZstdOptions) => Transform,
  'sync',
) as (options?: TZstdOptions) => Transform;

/**
 * Opens a zstd decompression transform stream. Requires Node 22 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * `destroy()` on the returned stream genuinely stops it; unlike the one-shot buffer form of the same
 * codec above, this shape has always been fully stoppable.
 */
export const createZstdDecompress = gatedWrapped(
  has('createZstdDecompress'),
  'createZstdDecompress',
  '22',
  () => zlibCb.createZstdDecompress as (options?: TZstdOptions) => Transform,
  'sync',
) as (options?: TZstdOptions) => Transform;

/**
 * The zstd compression transform stream class. Requires Node 22 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 */
export const ZstdCompress = gatedClassWrapped(
  has('ZstdCompress'),
  'ZstdCompress',
  '22',
  () => zlibCb.ZstdCompress as unknown as new (options?: TZstdOptions) => Transform,
);

/**
 * The zstd decompression transform stream class. Requires Node 22 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 */
export const ZstdDecompress = gatedClassWrapped(
  has('ZstdDecompress'),
  'ZstdDecompress',
  '22',
  () => zlibCb.ZstdDecompress as unknown as new (options?: TZstdOptions) => Transform,
);

/**
 * Compresses an iterable or async iterable of chunks with gzip, resolving one `Buffer`. Requires
 * Node 24 or later; throws `NotImplementedError` below that, driven by feature detection rather than
 * a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const compressGzip = gatedWrapped(
  has('compressGzip'),
  'compressGzip',
  '24',
  () => iterableCodecWrapped<Buffer>(zlibCb.compressGzip),
  'promise',
) as TIterableCodecFn;

/**
 * Decompresses an iterable or async iterable of gzip-compressed chunks, resolving one `Buffer`.
 * Requires Node 24 or later; throws `NotImplementedError` below that, driven by feature detection
 * rather than a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const decompressGzip = gatedWrapped(
  has('decompressGzip'),
  'decompressGzip',
  '24',
  () => iterableCodecWrapped<Buffer>(zlibCb.decompressGzip),
  'promise',
) as TIterableCodecFn;

/**
 * Compresses an iterable or async iterable of chunks with deflate, resolving one `Buffer`. Requires
 * Node 24 or later; throws `NotImplementedError` below that, driven by feature detection rather than
 * a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const compressDeflate = gatedWrapped(
  has('compressDeflate'),
  'compressDeflate',
  '24',
  () => iterableCodecWrapped<Buffer>(zlibCb.compressDeflate),
  'promise',
) as TIterableCodecFn;

/**
 * Decompresses an iterable or async iterable of deflate-compressed chunks, resolving one `Buffer`.
 * Requires Node 24 or later; throws `NotImplementedError` below that, driven by feature detection
 * rather than a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const decompressDeflate = gatedWrapped(
  has('decompressDeflate'),
  'decompressDeflate',
  '24',
  () => iterableCodecWrapped<Buffer>(zlibCb.decompressDeflate),
  'promise',
) as TIterableCodecFn;

/**
 * Compresses an iterable or async iterable of chunks with brotli, resolving one `Buffer`. Requires
 * Node 24 or later; throws `NotImplementedError` below that, driven by feature detection rather than
 * a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const compressBrotli = gatedWrapped(
  has('compressBrotli'),
  'compressBrotli',
  '24',
  () => iterableCodecWrapped<Buffer>(zlibCb.compressBrotli),
  'promise',
) as TIterableCodecFn;

/**
 * Decompresses an iterable or async iterable of brotli-compressed chunks, resolving one `Buffer`.
 * Requires Node 24 or later; throws `NotImplementedError` below that, driven by feature detection
 * rather than a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const decompressBrotli = gatedWrapped(
  has('decompressBrotli'),
  'decompressBrotli',
  '24',
  () => iterableCodecWrapped<Buffer>(zlibCb.decompressBrotli),
  'promise',
) as TIterableCodecFn;

/**
 * Compresses an iterable or async iterable of chunks with zstd, resolving one `Buffer`. Requires
 * Node 24 or later; throws `NotImplementedError` below that, driven by feature detection rather than
 * a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const compressZstd = gatedWrapped(
  has('compressZstd'),
  'compressZstd',
  '24',
  () => iterableCodecWrapped<Buffer>(zlibCb.compressZstd),
  'promise',
) as TIterableCodecFn;

/**
 * Decompresses an iterable or async iterable of zstd-compressed chunks, resolving one `Buffer`.
 * Requires Node 24 or later; throws `NotImplementedError` below that, driven by feature detection
 * rather than a version parse.
 *
 * Canceling genuinely stops the work: it stops pulling from the source between chunks and calls the
 * source iterator's own return(), so nothing more reaches the codec after that point.
 */
export const decompressZstd = gatedWrapped(
  has('decompressZstd'),
  'decompressZstd',
  '24',
  () => iterableCodecWrapped<Buffer>(zlibCb.decompressZstd),
  'promise',
) as TIterableCodecFn;

/**
 * Synchronous counterpart of {@link compressGzip}. Requires Node 24 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const compressGzipSync = gatedWrapped(
  has('compressGzipSync'),
  'compressGzipSync',
  '24',
  () => zlibCb.compressGzipSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link decompressGzip}. Requires Node 24 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const decompressGzipSync = gatedWrapped(
  has('decompressGzipSync'),
  'decompressGzipSync',
  '24',
  () => zlibCb.decompressGzipSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link compressDeflate}. Requires Node 24 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const compressDeflateSync = gatedWrapped(
  has('compressDeflateSync'),
  'compressDeflateSync',
  '24',
  () => zlibCb.compressDeflateSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link decompressDeflate}. Requires Node 24 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const decompressDeflateSync = gatedWrapped(
  has('decompressDeflateSync'),
  'decompressDeflateSync',
  '24',
  () => zlibCb.decompressDeflateSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link compressBrotli}. Requires Node 24 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const compressBrotliSync = gatedWrapped(
  has('compressBrotliSync'),
  'compressBrotliSync',
  '24',
  () => zlibCb.compressBrotliSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link decompressBrotli}. Requires Node 24 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const decompressBrotliSync = gatedWrapped(
  has('decompressBrotliSync'),
  'decompressBrotliSync',
  '24',
  () => zlibCb.decompressBrotliSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link compressZstd}. Requires Node 24 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const compressZstdSync = gatedWrapped(
  has('compressZstdSync'),
  'compressZstdSync',
  '24',
  () => zlibCb.compressZstdSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * Synchronous counterpart of {@link decompressZstd}. Requires Node 24 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Synchronous; nothing to cancel.
 */
export const decompressZstdSync = gatedWrapped(
  has('decompressZstdSync'),
  'decompressZstdSync',
  '24',
  () => zlibCb.decompressZstdSync as (source: unknown, options?: unknown) => Buffer,
  'sync',
) as (source: Iterable<unknown>, options?: unknown) => Buffer;

/**
 * The in-memory zip archive builder. Requires Node 26 or later; throws `NotImplementedError` below
 * that, driven by feature detection rather than a version parse.
 */
export const ZipBuffer = gatedClassWrapped(
  has('ZipBuffer'),
  'ZipBuffer',
  '26',
  () => zlibCb.ZipBuffer as unknown as new (...args: unknown[]) => object,
);

/** The zip archive builder's write surface `zipFiles` depends on, named from the surface manifest's
 * published method list. Node has not shipped the real class on any tracked runtime yet, so this
 * narrows only what the walker below calls, not `ZipBuffer` / `createZipArchive`'s full shape. */
interface IZipArchiveWriter {
  addEntry(path: string): unknown;
  close(): unknown;
}

/**
 * Opens a zip archive builder backed by a stream, written to `target`. Requires Node 26 or later;
 * throws `NotImplementedError` below that, driven by feature detection rather than a version parse.
 */
export const createZipArchive = gatedWrapped(
  has('createZipArchive'),
  'createZipArchive',
  '26',
  () => zlibCb.createZipArchive as (target: string, options?: TZipFilesOptions) => IZipArchiveWriter,
  'sync',
) as (target: string, options?: TZipFilesOptions) => IZipArchiveWriter;

/**
 * Synchronous counterpart of {@link createZipArchive}. Requires Node 26 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 */
export const createZipArchiveSync = gatedWrapped(
  has('createZipArchiveSync'),
  'createZipArchiveSync',
  '26',
  () => zlibCb.createZipArchiveSync as (target: string, options?: TZipFilesOptions) => IZipArchiveWriter,
  'sync',
) as (target: string, options?: TZipFilesOptions) => IZipArchiveWriter;

/**
 * Reads the configured maximum decompressed entry size for zip extraction. Requires Node 26 or
 * later; throws `NotImplementedError` below that, driven by feature detection rather than a version
 * parse.
 */
export const getMaxZipContentSize = gatedWrapped(
  has('getMaxZipContentSize'),
  'getMaxZipContentSize',
  '26',
  () => zlibCb.getMaxZipContentSize as () => number,
  'sync',
) as () => number;

/**
 * Sets the configured maximum decompressed entry size for zip extraction. Requires Node 26 or later;
 * throws `NotImplementedError` below that, driven by feature detection rather than a version parse.
 */
export const setMaxZipContentSize = gatedWrapped(
  has('setMaxZipContentSize'),
  'setMaxZipContentSize',
  '26',
  () => zlibCb.setMaxZipContentSize as (size: number) => void,
  'sync',
) as (size: number) => void;

function zipFilesImpl(files: readonly string[], target: string, options?: TZipFilesOptions): CancelablePromise<void> {
  const archive = (zlibCb.createZipArchive as (targetPath: string, opts?: TZipFilesOptions) => IZipArchiveWriter)(
    target,
    options,
  );

  const walk = checkpointWalkWrapped<string, void>((file) => {
    archive.addEntry(file);
  });

  return walk(files).then(() => {
    archive.close();
  });
}

/**
 * Writes `files` into a zip archive at `target`, one at a time. Requires Node 26 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Canceling checkpoints at a file boundary: no further entry is opened after that point, the entries
 * already written stay in the archive, and none of them is rolled back.
 */
export const zipFiles = gatedWrapped(
  has('createZipArchive'),
  'zipFiles',
  '26',
  () => zipFilesImpl,
  'promise',
) as TZipFilesFn;

export type { TIterableCodecFn, TZipFilesFn, TZipFilesOptions, TZstdOptions } from './types';

// the synchronous factory surface (createGzip, createInflate, the plain codec classes, constants,
// and every *Sync buffer codec that has no version gate) passes through untouched, so a caller
// building a pipeline is not forced into a second import for one operation; the wrapped and gated
// bindings above are declared locally and win over this star re-export for every name they share,
// per the language's own name resolution rather than any ordering trick
export * from 'node:zlib';
