import * as nodeFs from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { CancelError } from '@cancjs/promise';
import { describe, expect, jest, test } from '@jest/globals';

import { features } from '../features';
import { __resetCancProtoForTest, decorate } from './file-handle';
import { open } from './index';
import { resetFs, setFs } from './registry';

describe('FileHandle', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    resetFs();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        try {
          nodeFs.rmSync(dir, { recursive: true, force: true });
        } catch (_err) {
          // ignore
        }
      }
    }
  });

  test('keeps a real handle usable after a fake implementation was decorated', async () => {
    const fakeHandle = { close: jest.fn(async () => {}) };
    setFs({
      promises: {
        open: jest.fn(async () => fakeHandle),
      },
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fakeOpened = await open('package.json', 'r');
      await fakeOpened.close();
    } finally {
      warnSpy.mockRestore();
    }

    resetFs();

    const fh = await open('package.json', 'r');
    try {
      expect(typeof fh.read).toBe('function');
      expect(typeof fh.stat).toBe('function');
      expect(typeof fh.close).toBe('function');
      const stat = await fh.stat();
      expect(stat.size).toBeGreaterThan(0);
      const buf = Buffer.alloc(10);
      const readResult = await fh.read(buf, 0, 10, 0);
      expect(readResult.bytesRead).toBe(10);
    } finally {
      await fh.close();
    }
  });

  test('real open produces zero console.warn calls', async () => {
    __resetCancProtoForTest();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const fh = await open('package.json', 'r');
    try {
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      await fh.close();
      warnSpy.mockRestore();
    }
  });

  test('fh instanceof native class, fd getter works, override reaches native', async () => {
    const fh = await fs.open('package.json', 'r');
    const NativeClass = fh.constructor;
    decorate(fh);

    expect(fh instanceof NativeClass).toBe(true);
    expect(typeof fh.fd).toBe('number');

    const stat = await fh.stat();
    expect(stat.size).toBeGreaterThan(0);

    await fh.close();
  });

  test('readFile(decoratedHandle) still works', async () => {
    const fh = await fs.open('package.json', 'r');
    decorate(fh);

    const content = await fs.readFile(fh, 'utf8');
    expect(typeof content).toBe('string');
    expect(content.includes('name')).toBe(true);

    await fh.close();
  });

  test('await using routes through our close override', async () => {
    let overrideRan = false;
    const fh = decorate(await fs.open('package.json', 'r'));

    if (typeof Symbol.asyncDispose === 'symbol') {
      expect(typeof fh[Symbol.asyncDispose]).toBe('function');
    }

    const origClose = fh.close.bind(fh);
    fh.close = function () {
      overrideRan = true;
      return origClose();
    };

    await (async () => {
      await using _handle = fh;
    })();

    expect(overrideRan).toBe(true);
  });

  test('own-member scan uses Object.getOwnPropertyNames', async () => {
    const fh = await fs.open('package.json', 'r');
    const spy = jest.spyOn(Object, 'getOwnPropertyNames');

    decorate(fh);

    expect(spy).toHaveBeenCalledWith(fh);
    spy.mockRestore();

    await fh.close();
  });

  test('Capture-time skip: diagnostic on missing member', async () => {
    __resetCancProtoForTest();
    const fakeProto = {
      read: jest.fn(),
    };
    const fakeFh = Object.create(fakeProto);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      decorate(fakeFh);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnMsg = warnSpy.mock.calls[0][0] as string;
      expect(warnMsg).toContain('missing members');
      expect(warnMsg).toContain('readFile');
      expect(fakeFh.read).not.toBe(fakeProto.read);
      expect((fakeFh as Record<string, unknown>).readFile).toBeUndefined();
    } finally {
      warnSpy.mockRestore();
      __resetCancProtoForTest();
    }
  });

  test('fh.writeFile(asyncIterable) canceled mid-stream calls return()', async () => {
    if (features.nodeMajor < 22) return;
    const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'canc-fh-iter-'));
    tempDirs.push(dir);
    const testFile = path.join(dir, 'iter.tmp');
    const fh = decorate(await fs.open(testFile, 'w'));

    let started = false;
    let returned = false;
    let unblockNext: (() => void) | undefined;
    const asyncIterable: AsyncIterable<string> = {
      async *[Symbol.asyncIterator]() {
        try {
          started = true;
          yield 'chunk 1\n';
          await new Promise<void>((r) => {
            unblockNext = r;
          });
          yield 'chunk 2\n';
        } finally {
          returned = true;
        }
      },
    };

    try {
      const p = fh.writeFile(asyncIterable as unknown as Uint8Array, {});

      // wait until the iterator starts before canceling
      while (!started) {
        await new Promise((r) => setImmediate(r));
      }
      p.cancel();
      await expect(p).rejects.toThrow(CancelError);
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setImmediate(r));
      }
      expect(returned).toBe(true);
    } finally {
      unblockNext?.();
      await fh.close().catch(() => {});
    }
  });

  test('close cannot be canceled, fd is still closed', async () => {
    const fh = decorate(await fs.open('package.json', 'r'));

    const p = fh.close();
    p.cancel();

    await p;

    try {
      await fh.stat();
      throw new Error('should have thrown');
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      expect(e.code === 'EBADF' || e.message?.includes('closed')).toBe(true);
    }
  });

  test('createReadStream and createWriteStream return streams, not promises', async () => {
    const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'canc-fh-streams-'));
    tempDirs.push(dir);
    const srcFile = path.join(dir, 'src.txt');
    const dstFile = path.join(dir, 'dst.txt');
    nodeFs.writeFileSync(srcFile, 'hello streams');

    const srcFh = decorate(await fs.open(srcFile, 'r'));
    const dstFh = decorate(await fs.open(dstFile, 'w'));

    const rs = srcFh.createReadStream();
    expect(rs instanceof Promise).toBe(false);
    expect(typeof rs.pipe).toBe('function');

    const ws = dstFh.createWriteStream();
    expect(ws instanceof Promise).toBe(false);
    expect(typeof ws.write).toBe('function');

    await srcFh.close();
    await dstFh.close();
    nodeFs.rmSync(dir, { recursive: true, force: true });
  });

  test('createReadStream pipes to createWriteStream end to end', async () => {
    const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'canc-fh-pipe-'));
    tempDirs.push(dir);
    const srcFile = path.join(dir, 'src.txt');
    const dstFile = path.join(dir, 'dst.txt');
    nodeFs.writeFileSync(srcFile, 'pipe payload data');

    const srcFh = decorate(await fs.open(srcFile, 'r'));
    const dstFh = decorate(await fs.open(dstFile, 'w'));

    const rs = srcFh.createReadStream();
    const ws = dstFh.createWriteStream();

    try {
      rs.pipe(ws);
    } catch (err) {
      await srcFh.close();
      await dstFh.close();
      nodeFs.rmSync(dir, { recursive: true, force: true });
      throw err;
    }

    await new Promise<void>((resolve, reject) => {
      ws.on('finish', () => resolve());
      ws.on('error', reject);
      rs.on('error', reject);
    });

    const copied = nodeFs.readFileSync(dstFile, 'utf8');
    expect(copied).toBe('pipe payload data');

    await srcFh.close();
    await dstFh.close();
    nodeFs.rmSync(dir, { recursive: true, force: true });
  });

  test('readableWebStream and readLines still return node values', async () => {
    const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'canc-fh-guards-'));
    tempDirs.push(dir);
    const testFile = path.join(dir, 'lines.txt');
    nodeFs.writeFileSync(testFile, 'line1\nline2\n');

    const fh1 = decorate(await fs.open(testFile, 'r'));
    if (typeof fh1.readLines === 'function') {
      const lines = fh1.readLines();
      expect(lines instanceof Promise).toBe(false);
      expect(typeof lines[Symbol.asyncIterator]).toBe('function');
    }
    await fh1.close();

    const fh2 = decorate(await fs.open(testFile, 'r'));
    if (typeof fh2.readableWebStream === 'function') {
      const webStream = fh2.readableWebStream();
      expect(webStream instanceof Promise).toBe(false);
      expect(typeof webStream.getReader).toBe('function');
    }
    await fh2.close();

    nodeFs.rmSync(dir, { recursive: true, force: true });
  });

  test('close() called twice concurrently on a handle resolves both without abort', async () => {
    const fh = decorate(await fs.open('package.json', 'r'));
    const p1 = fh.close();
    const p2 = fh.close();
    await expect(Promise.all([p1, p2])).resolves.toBeDefined();
  });

  test('cancel + explicit close resolves without abort', async () => {
    const fh = decorate(await fs.open('package.json', 'r'));
    const p1 = fh.close();
    p1.cancel();
    const p2 = fh.close();
    await expect(Promise.all([p1, p2])).resolves.toBeDefined();
  });
});
