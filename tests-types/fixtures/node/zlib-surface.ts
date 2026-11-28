import type {
  BrotliCompress,
  BrotliDecompress,
  Deflate,
  DeflateRaw,
  Gunzip,
  Gzip,
  Inflate,
  InflateRaw,
  Unzip,
  BrotliOptions,
  InputType,
  TCreateZipArchiveFn,
  TIterableCodecFn,
  TZipArchiveOptions,
  TZipFilesFn,
  TZipFilesOptions,
  TZstdOptions,
  Zlib,
  ZlibOptions,
} from '@cancjs/node/zlib';
import {
  ZstdCompress,
  ZstdDecompress,
  brotliCompress,
  brotliDecompress,
  compressBrotli,
  compressDeflate,
  compressGzip,
  compressZstd,
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
  createZipArchive,
  createZstdCompress,
  createZstdDecompress,
  decompressBrotli,
  decompressDeflate,
  decompressGzip,
  decompressZstd,
  deflate,
  deflateRaw,
  gunzip,
  gzip,
  inflate,
  inflateRaw,
  unzip,
  zipFiles,
  zstdCompress,
  zstdDecompress,
} from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { CompressCallback } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { TCreateZipArchiveSyncFn } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_ASCII } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_BEST_COMPRESSION } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_BEST_SPEED } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_BINARY } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_BLOCK } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_BUF_ERROR } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_DATA_ERROR } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_DEFAULT_COMPRESSION } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_DEFAULT_STRATEGY } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_DEFLATED } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_ERRNO } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_FILTERED } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_FINISH } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_FIXED } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_FULL_FLUSH } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_HUFFMAN_ONLY } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_MEM_ERROR } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_NEED_DICT } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_NO_COMPRESSION } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_NO_FLUSH } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_OK } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_PARTIAL_FLUSH } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_RLE } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_STREAM_END } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_STREAM_ERROR } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_SYNC_FLUSH } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_TEXT } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_TREES } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_UNKNOWN } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { Z_VERSION_ERROR } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { ZipBuffer } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { ZlibParams } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { ZlibReset } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { brotliCompressSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { brotliDecompressSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { compressBrotliSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { compressDeflateSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { compressGzipSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { compressZstdSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { crc32 } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { createZipArchiveSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { decompressBrotliSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { decompressDeflateSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { decompressGzipSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { decompressZstdSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { deflateRawSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { deflateSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { getMaxZipContentSize } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { gunzipSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { gzipSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { inflateRawSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { inflateSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { setMaxZipContentSize } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { unzipSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { zstdCompressSync } from '@cancjs/node/zlib';
// @ts-expect-error E6 removed named export
import type { zstdDecompressSync } from '@cancjs/node/zlib';

void [
  ZstdCompress,
  ZstdDecompress,
  brotliCompress,
  brotliDecompress,
  compressBrotli,
  compressDeflate,
  compressGzip,
  compressZstd,
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
  createZipArchive,
  createZstdCompress,
  createZstdDecompress,
  decompressBrotli,
  decompressDeflate,
  decompressGzip,
  decompressZstd,
  deflate,
  deflateRaw,
  gunzip,
  gzip,
  inflate,
  inflateRaw,
  unzip,
  zipFiles,
  zstdCompress,
  zstdDecompress,
];
