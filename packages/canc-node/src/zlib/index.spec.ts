import nodeZlib from 'node:zlib';

import { CancelablePromise, isCancelError, Unlisted } from '@cancjs/promise';

import { isNotImplementedError } from '../errors/classes';
import * as zlibExports from './index';
import { iterableCodecWrapped } from './wrap';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// Never invoked: the point is that tsc resolves the call at the exact shape below, so `gzip`
// accidentally widened to `unknown` fails compilation here rather than at a consumer's call site.
function typeAssertions(): unknown[] {
  const derived = zlibExports.gzip('payload');

  type _Assertions = [Expect<Equal<typeof derived, CancelablePromise<Buffer, Unlisted>>>];

  return [derived];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const iterZlibSpec = (
  process as unknown as {
    getBuiltinModule?: (id: string) => Record<string, unknown> | undefined;
  }
).getBuiltinModule?.('node:zlib/iter');
const hasRealCompressGzip = typeof iterZlibSpec?.compressGzip === 'function';
const hasRealZipFiles = typeof (nodeZlib as unknown as Record<string, unknown>).createZipArchive === 'function';

describe('@cancjs/node/zlib', () => {
  it('gzip then gunzip round-trips a buffer', async () => {
    const original = Buffer.from('the quick brown fox jumps over the lazy dog');

    const compressed = await zlibExports.gzip(original);
    expect(compressed).toBeInstanceOf(Buffer);
    expect(compressed).not.toEqual(original);

    const decompressed = await zlibExports.gunzip(compressed);
    expect(decompressed).toBeInstanceOf(Buffer);
    expect(decompressed.equals(original)).toBe(true);
  });

  it('canceling gzip rejects CancelError while the underlying callback still fires later', async () => {
    const promise = zlibExports.gzip(Buffer.alloc(1024 * 1024, 7));
    promise.cancel('stop');

    const reason = await promise.catch((err: unknown) => err);
    expect(isCancelError(reason)).toBe(true);

    // the buffer tier's honest behavior: cancel stops the wait, the codec keeps running on the
    // threadpool, and nothing here should surface as an unhandledRejection once it finishes
    let unhandled: unknown;
    const onUnhandled = (err: unknown): void => {
      unhandled = err;
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      await sleep(200);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toBeUndefined();
  });

  it('brotliCompress then brotliDecompress round-trips a buffer', async () => {
    const original = Buffer.from('brotli round trip payload');
    const compressed = await zlibExports.brotliCompress(original);
    const decompressed = await zlibExports.brotliDecompress(compressed);
    expect(decompressed.equals(original)).toBe(true);
  });

  it('deflate then inflate round-trips a buffer', async () => {
    const original = Buffer.from('deflate round trip payload');
    const compressed = await zlibExports.deflate(original);
    const decompressed = await zlibExports.inflate(compressed);
    expect(decompressed.equals(original)).toBe(true);
  });

  it('zstdCompress and zstdDecompress round-trip when node has zstd (22+); NotImplementedError below that', async () => {
    if (!hasRealCompressGzip && typeof (nodeZlib as unknown as Record<string, unknown>).zstdCompress !== 'function') {
      let error: unknown;
      try {
        await zlibExports.zstdCompress(Buffer.from('x'));
      } catch (err) {
        error = err;
      }
      expect(isNotImplementedError(error)).toBe(true);
      expect((error as { required?: string }).required).toBe('22.15.0');
      return;
    }

    const original = Buffer.from('zstd round trip payload');
    const compressed = await zlibExports.zstdCompress(original);
    const decompressed = await zlibExports.zstdDecompress(compressed);
    expect(decompressed.equals(original)).toBe(true);
  });

  it(
    'compressGzip: the iterable wiring cancels between chunks, rejecting CancelError and calling ' +
      'return() on the source iterator, the same regression-proving property as the FileHandle work',
    async () => {
      // synthetic in place of node's real compressGzip (not shipped on any tracked runtime yet, see
      // ./types.ts): this exercises iterableCodecWrapped, the exact mechanism ./index.ts's compressGzip
      // export is built from, so the assertion is about the wiring rather than about a specific codec
      let sourceReturned = false;
      const seen: number[] = [];

      const source = (async function* () {
        try {
          let i = 0;
          while (true) {
            yield i++;
          }
        } finally {
          sourceReturned = true;
        }
      })();

      let pullsBeforeCancel = 0;
      const fakeNodeCompress: (guarded: AsyncIterable<unknown>) => Promise<Buffer> = async (guarded) => {
        for await (const chunk of guarded) {
          seen.push(chunk as number);
          pullsBeforeCancel++;
          if (pullsBeforeCancel === 3) {
            // cancel lands between pulls, from inside the loop that stands in for node's own
            // internal consumption of the guarded iterable
            promise.cancel('stop mid-stream');
          }
          await Promise.resolve();
        }
        return Buffer.from(seen);
      };

      const wrapped = iterableCodecWrapped<Buffer>(fakeNodeCompress as (...args: unknown[]) => unknown);
      const promise = wrapped(source);

      const reason = await promise.catch((err: unknown) => err);
      expect(isCancelError(reason)).toBe(true);
      expect(sourceReturned).toBe(true);
      expect(seen.length).toBeGreaterThan(0);
    },
  );

  it('a consumer that stops early calls the source return(), so the upstream finally runs', async () => {
    let sourceReturned = false;

    const source = (async function* () {
      try {
        yield 1;
        yield 2;
      } finally {
        sourceReturned = true;
      }
    })();

    // node's own consumer breaks out of the loop after the first chunk, which must reach the source
    const fakeNodeCompress: (guarded: AsyncIterable<unknown>) => Promise<Buffer> = async (guarded) => {
      for await (const _chunk of guarded) {
        break;
      }
      return Buffer.alloc(0);
    };

    const wrapped = iterableCodecWrapped<Buffer>(fakeNodeCompress as (...args: unknown[]) => unknown);
    await wrapped(source);

    expect(sourceReturned).toBe(true);
  });

  it('a source whose return() rejects on cancel does not surface an unhandledRejection', async () => {
    let unhandled: unknown;
    const onUnhandled = (err: unknown): void => {
      unhandled = err;
    };

    const source: AsyncIterable<number> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<number>>(() => undefined),
          return: () => Promise.reject(new Error('source return failed')),
        };
      },
    };

    const fakeNodeCompress: (guarded: AsyncIterable<unknown>) => Promise<Buffer> = async (guarded) => {
      for await (const _chunk of guarded) {
        // never reached: the source never yields
      }
      return Buffer.alloc(0);
    };

    const wrapped = iterableCodecWrapped<Buffer>(fakeNodeCompress as (...args: unknown[]) => unknown);
    const promise = wrapped(source);

    process.on('unhandledRejection', onUnhandled);
    try {
      promise.cancel('stop');
      const reason = await promise.catch((err: unknown) => err);
      expect(isCancelError(reason)).toBe(true);
      await sleep(50);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(unhandled).toBeUndefined();
  });

  it('compressGzip rejects NotImplementedError naming 25.9 when node has no iterable codec module', async () => {
    if (hasRealCompressGzip) {
      return;
    }

    let error: unknown;
    try {
      await zlibExports.compressGzip([Buffer.from('x')]);
    } catch (err) {
      error = err;
    }
    expect(isNotImplementedError(error)).toBe(true);
    expect((error as { required?: string }).required).toBe('25.9.0 (or --experimental-stream-iter)');
  });

  it('zipFiles throws NotImplementedError naming 26.8.0 synchronously when node has no zipFiles', () => {
    if (hasRealZipFiles) {
      return;
    }

    let error: unknown;
    try {
      zlibExports.zipFiles([['a.txt', 'a.txt']]);
    } catch (err) {
      error = err;
    }
    expect(isNotImplementedError(error)).toBe(true);
    expect((error as { required?: string }).required).toBe('26.8.0');
  });

  it('crc32 computes a checksum on 20.15+, throws NotImplementedError naming 20.15 below that', () => {
    if (typeof (nodeZlib as unknown as Record<string, unknown>).crc32 !== 'function') {
      let error: unknown;
      try {
        zlibExports.crc32('payload');
      } catch (err) {
        error = err;
      }
      expect(isNotImplementedError(error)).toBe(true);
      expect((error as { required?: string }).required).toBe('20.15.0');
      return;
    }

    expect(typeof zlibExports.crc32('payload')).toBe('number');
  });

  it('re-exports the stream factory surface unchanged, not routed through a promise', () => {
    expect(typeof zlibExports.createGzip).toBe('function');
    expect(typeof zlibExports.createGunzip).toBe('function');
    expect(typeof zlibExports.constants).toBe('object');

    const gzipStream = zlibExports.createGzip();
    expect(gzipStream).not.toBeInstanceOf(CancelablePromise);
    gzipStream.destroy();
  });

  it('re-exports the synchronous buffer codecs unchanged, not routed through a promise', () => {
    const original = Buffer.from('sync round trip payload');
    const compressed = zlibExports.gzipSync(original);
    expect(compressed).not.toBeInstanceOf(CancelablePromise);
    const decompressed = zlibExports.gunzipSync(compressed);
    expect(decompressed.equals(original)).toBe(true);
  });

  it('gated exports are reflectable and retain names when available on Node 22.15+/24', () => {
    const { ZstdCompress, crc32 } = zlibExports;
    if (typeof (nodeZlib as unknown as Record<string, unknown>).ZstdCompress === 'function') {
      expect(() => Object.getOwnPropertyDescriptors(ZstdCompress)).not.toThrow();
      expect(ZstdCompress.name).toBe('ZstdCompress');
    }
    if (typeof (nodeZlib as unknown as Record<string, unknown>).crc32 === 'function') {
      expect(crc32.name).toBe('crc32');
    }
  });

  it('type fixture: gzip resolves exactly Buffer, not unknown', () => {
    // never called; its existence as a function value is enough to keep it from being flagged
    // unused while tsc still checks its body
    expect(typeof typeAssertions).toBe('function');
  });
});
