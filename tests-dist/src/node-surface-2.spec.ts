import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(__dirname, '../..');
const probe =
  'const assert=require(\'node:assert/strict\'),{createRequire}=require(\'node:module\'),fs=require(\'node:fs\'),os=require(\'node:os\'),path=require(\'node:path\');\nconst load=n=>process.env.FORMAT===\'CJS\'?Promise.resolve(require(n)):import(n);\n(async()=>{const data={"zlib":{"retained":{"values":["BrotliCompress","BrotliDecompress","Deflate","DeflateRaw","Gunzip","Gzip","Inflate","InflateRaw","Unzip","ZstdCompress","ZstdDecompress","brotliCompress","brotliDecompress","compressBrotli","compressDeflate","compressGzip","compressZstd","constants","createBrotliCompress","createBrotliDecompress","createDeflate","createDeflateRaw","createGunzip","createGzip","createInflate","createInflateRaw","createUnzip","createZipArchive","createZstdCompress","createZstdDecompress","decompressBrotli","decompressDeflate","decompressGzip","decompressZstd","deflate","deflateRaw","gunzip","gzip","inflate","inflateRaw","unzip","zipFiles","zstdCompress","zstdDecompress"]},"removed":["CompressCallback","TCreateZipArchiveSyncFn","Z_ASCII","Z_BEST_COMPRESSION","Z_BEST_SPEED","Z_BINARY","Z_BLOCK","Z_BUF_ERROR","Z_DATA_ERROR","Z_DEFAULT_COMPRESSION","Z_DEFAULT_STRATEGY","Z_DEFLATED","Z_ERRNO","Z_FILTERED","Z_FINISH","Z_FIXED","Z_FULL_FLUSH","Z_HUFFMAN_ONLY","Z_MEM_ERROR","Z_NEED_DICT","Z_NO_COMPRESSION","Z_NO_FLUSH","Z_OK","Z_PARTIAL_FLUSH","Z_RLE","Z_STREAM_END","Z_STREAM_ERROR","Z_SYNC_FLUSH","Z_TEXT","Z_TREES","Z_UNKNOWN","Z_VERSION_ERROR","ZipBuffer","ZlibParams","ZlibReset","brotliCompressSync","brotliDecompressSync","compressBrotliSync","compressDeflateSync","compressGzipSync","compressZstdSync","crc32","createZipArchiveSync","decompressBrotliSync","decompressDeflateSync","decompressGzipSync","decompressZstdSync","deflateRawSync","deflateSync","getMaxZipContentSize","gunzipSync","gzipSync","inflateRawSync","inflateSync","setMaxZipContentSize","unzipSync","zstdCompressSync","zstdDecompressSync"],"nativeValues":["BrotliCompress","BrotliDecompress","Deflate","DeflateRaw","Gunzip","Gzip","Inflate","InflateRaw","Unzip","constants","createBrotliCompress","createBrotliDecompress","createDeflate","createDeflateRaw","createGunzip","createGzip","createInflate","createInflateRaw","createUnzip"]}},core=await load(\'@cancjs/promise\'),node=await load(\'@cancjs/node\'),c=await load(\'@cancjs/node/crypto\'),z=await load(\'@cancjs/node/zlib\'),d=await load(\'@cancjs/node/dgram\'),f=await load(\'@cancjs/node/fs/extra\'),nc=require(\'node:crypto\'),nz=require(\'node:zlib\');\nfor(const [mod,actual,native] of [[\'zlib\',z,nz]]){assert.deepEqual(Object.keys(actual).sort(),data[mod].retained.values.slice().sort());for(const key of data[mod].nativeValues)assert.equal(actual[key],native[key],mod+\' \'+key);for(const key of data[mod].removed)assert.equal(key in actual,false,mod+\' \'+key)}\nconst compressed=await z.gzip(Buffer.from(\'payload\'));assert.equal((await z.gunzip(compressed)).toString(),\'payload\');\nif(typeof nz.ZstdCompress===\'function\')assert.equal(z.ZstdCompress,nz.ZstdCompress);else assert.throws(()=>new z.ZstdCompress(),node.isNotImplementedError);\nif(typeof nz.createZipArchive===\'function\'){const stream=z.createZipArchive([]);assert.equal(typeof stream.destroy,\'function\');assert.equal(stream instanceof core.CancelablePromise,false);stream.destroy()}else assert.throws(()=>z.createZipArchive([]),node.isNotImplementedError);\nconsole.log(\'PASS row 2 \'+process.env.FORMAT)\n})().catch(e=>{console.error(e);process.exitCode=1});\n';

it.each(['CJS', 'ESM'])('Node public surface row 2 %s', (format) => {
  const tempRoot = path.join(os.tmpdir(), 'canc');
  fs.mkdirSync(tempRoot, { recursive: true });
  const owned = fs.mkdtempSync(path.join(tempRoot, 'canc-node-surface-'));
  try {
    for (const [src, target] of [
      ['node', '@cancjs/node'],
      ['node', 'node-physical-copy'],
      ['promise', '@cancjs/promise'],
      ['toolbox', '@cancjs/toolbox'],
    ]) {
      const dest = path.join(owned, 'node_modules', target);
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(path.join(repo, 'packages', 'canc-' + src, 'package.json'), path.join(dest, 'package.json'));
      fs.cpSync(path.join(repo, 'packages', 'canc-' + src, 'dist'), path.join(dest, 'dist'), { recursive: true });
      expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false);
    }
    fs.cpSync(path.join(repo, 'node_modules', 'graceful-fs'), path.join(owned, 'node_modules', 'graceful-fs'), {
      recursive: true,
      dereference: true,
    });
    const output = execFileSync(process.execPath, ['--unhandled-rejections=strict', '-e', probe], {
      cwd: owned,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, FORMAT: format },
    });
    expect(output).toContain('PASS row 2 ' + format);
  } finally {
    fs.rmSync(owned, { recursive: true, force: true });
  }
});
