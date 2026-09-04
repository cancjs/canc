import type { BrotliOptions, InputType, ZlibOptions } from 'node:zlib';

import type { CancelablePromise } from '@cancjs/promise';

/** Shape shared by every buffer-tier codec: raw input in, one `Buffer` out, options optional. */
export type TZlibBufferFn = (data: InputType, options?: ZlibOptions) => CancelablePromise<Buffer>;

/** Same shape, `BrotliOptions` in place of `ZlibOptions`; brotli's option set does not overlap. */
export type TBrotliBufferFn = (data: InputType, options?: BrotliOptions) => CancelablePromise<Buffer>;

/**
 * zstd's options, hand-declared: absent from installed typings because zstd support (node 22)
 * postdates the pinned `@types/node` major. Kept intentionally loose rather than guessed
 * field-by-field; narrow this when real typings land.
 */
export type TZstdOptions = Readonly<Record<string, unknown>>;

export type TZstdBufferFn = (data: InputType, options?: TZstdOptions) => CancelablePromise<Buffer>;

/**
 * Iterable compression and decompression (node 24+): consumes an iterable or async iterable of
 * chunks and resolves the codec's output as one `Buffer`. The cancel-between-chunks behavior lives
 * in the wrapper, not the type; see `./wrap.ts`'s `iterableCodecWrapped`.
 */
export type TIterableCodecFn = (
  source: AsyncIterable<InputType> | Iterable<InputType>,
  options?: ZlibOptions,
) => CancelablePromise<Buffer>;

/**
 * `zipFiles`'s options, hand-declared for the same reason as {@link TZstdOptions}: node 26 postdates
 * the pinned typings.
 */
export type TZipFilesOptions = Readonly<Record<string, unknown>>;

/**
 * Walks `files`, writing each into the archive at `target`. Checkpointed per file: a cancel stops
 * before the next entry opens and leaves whatever was already written, with no rollback.
 */
export type TZipFilesFn = (
  files: readonly string[],
  target: string,
  options?: TZipFilesOptions,
) => CancelablePromise<void>;
