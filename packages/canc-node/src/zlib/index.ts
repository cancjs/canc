import type { Transform } from 'node:stream';
import nodeZlib from 'node:zlib';

import {
  TBrotliBufferFn,
  TCreateZipArchiveFn,
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
  TIterableCodecFn,
  TZipArchiveOptions,
  TZipFilesFn,
  TZipFilesOptions,
  TZstdOptions,
} from './types';

// Deliberate named stream factories/classes/types; other native exports stay in node:zlib.
export type { BrotliOptions, InputType, Zlib, ZlibOptions } from 'node:zlib';
export {
  BrotliCompress,
  BrotliDecompress,
  constants,
  createBrotliCompress,
  createBrotliDecompress,
  createDeflate,
  createDeflateRaw,
  createGunzip,
  createGzip,
  createInflate,
  createInflateRaw,
  createUnzip,
  Deflate,
  DeflateRaw,
  Gunzip,
  Gzip,
  Inflate,
  InflateRaw,
  Unzip,
} from 'node:zlib';
