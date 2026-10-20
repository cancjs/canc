import type { Readable } from 'node:stream';
import type { BrotliOptions, InputType, ZlibOptions } from 'node:zlib';

import type { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../../_util';

/** Shape shared by every buffer-tier codec: raw input in, one `Buffer` out, options optional. */
export type TZlibBufferFn = (data: InputType, options?: ZlibOptions) => CancelablePromise<Buffer, Unlisted>;

/** Same shape, `BrotliOptions` in place of `ZlibOptions`; brotli's option set does not overlap. */
export type TBrotliBufferFn = (data: InputType, options?: BrotliOptions) => CancelablePromise<Buffer, Unlisted>;

/**
 * zstd's options, hand-declared: absent from installed typings because zstd support (node 22)
 * postdates the pinned `@types/node` major. Kept intentionally loose rather than guessed
 * field-by-field; narrow this when real typings land.
 */
export type TZstdOptions = Readonly<Record<string, unknown>>;

export type TZstdBufferFn = (data: InputType, options?: TZstdOptions) => CancelablePromise<Buffer, Unlisted>;

/**
 * Iterable compression and decompression (node 24+): consumes an iterable or async iterable of
 * chunks and resolves the codec's output as one `Buffer`. The cancel-between-chunks behavior lives
 * in the wrapper, not the type; see `./wrap.ts`'s `iterableCodecWrapped`.
 */
export type TIterableCodecFn = (
  source: AsyncIterable<InputType> | Iterable<InputType>,
  options?: ZlibOptions,
) => CancelablePromise<Buffer, Unlisted>;

/**
 * `zipFiles`'s options, hand-declared for the same reason as {@link TZstdOptions}: node 26 postdates
 * the pinned typings.
 */
export type TZipFilesOptions = Readonly<Record<string, unknown>>;

/**
 * Node's `zipFiles` shape: `[sourcePath, entryName]` pairs in, a `Readable` of archive bytes out.
 * Synchronous; there is no promise, so cancel is destroying the returned stream.
 */
export type TZipFilesFn = (files: Iterable<readonly [string, string]>, options?: TZipFilesOptions) => Readable;
