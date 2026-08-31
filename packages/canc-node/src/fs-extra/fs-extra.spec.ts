import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CancelError } from '@cancjs/promise';

import { isJsonParseError, JsonParseError } from '../errors/classes';
import { exists, mkdir, writeFile } from '../fs';
import {
  ensureDir,
  ensureFile,
  ensureLink,
  ensureSymlink,
  outputFile,
  outputJson,
  outputJsonSync,
  pathExists,
  readJson,
  readJsonSync,
  writeJson,
  writeJsonSync,
} from './index';

async function cleanDir(dirPath: string) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await cleanDir(fullPath);
      } else {
        await fs.unlink(fullPath);
      }
    }
    await fs.rmdir(dirPath);
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      // ignore
    }
  }
}

describe('fs-extra', () => {
  const root = join(tmpdir(), 'fs-extra-test-' + Math.random().toString(36).slice(2));

  beforeAll(async () => {
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await cleanDir(root);
  });

  it('ensureDir on existing directory resolves', async () => {
    const dir = join(root, 'dir1');
    await mkdir(dir);
    await expect(ensureDir(dir)).resolves.toBeUndefined();
  });

  it('ensureDir on a path whose parent is a FILE rejects ENOTDIR', async () => {
    const filePath = join(root, 'parent-file.txt');
    await writeFile(filePath, 'not a dir');
    const childDir = join(filePath, 'sub');
    await expect(ensureDir(childDir)).rejects.toThrow();
  });

  it('ensureFile creates parent dirs and empty file', async () => {
    const file = join(root, 'ensure-f/a/b.txt');
    await ensureFile(file);
    await expect(fs.readFile(file, 'utf8')).resolves.toBe('');
  });

  it('ensureLink creates hardlink and parent dirs', async () => {
    const src = join(root, 'src-link.txt');
    await writeFile(src, 'content');
    const dest = join(root, 'dest-link/sub/link.txt');
    await ensureLink(src, dest);
    await expect(fs.readFile(dest, 'utf8')).resolves.toBe('content');
  });

  it('ensureSymlink creates symlink and parent dirs', async () => {
    const src = join(root, 'src-sym.txt');
    await writeFile(src, 'sym-content');
    const dest = join(root, 'dest-sym/sub/sym.txt');
    try {
      await ensureSymlink(src, dest, 'file');
      await expect(fs.readFile(dest, 'utf8')).resolves.toBe('sym-content');
    } catch (e: any) {
      if (process.platform === 'win32' && e.code === 'EPERM') {
        // Windows unprivileged symlink skip
        return;
      }
      throw e;
    }
  });

  it('outputFile creates parents', async () => {
    const file = join(root, 'a/b/c/test.txt');
    await outputFile(file, 'hello');
    await expect(fs.readFile(file, 'utf8')).resolves.toBe('hello');
  });

  it('pathExists aliases exists', () => {
    expect(pathExists).toBe(exists);
  });

  it('cancel mid-ensureDir on deep path rejects CancelError', async () => {
    const deepDir = join(root, 'cancel-deep/1/2/3/4/5/6/7/8/9');
    const p = ensureDir(deepDir);
    p.cancel();
    await expect(p).rejects.toThrow(CancelError);
  });

  describe('json', () => {
    it('round trip: writeJson then readJson returns deep-equal object', async () => {
      const obj = { str: 'hello', num: 42, nested: { arr: [1, 2, 3], bool: true } };
      const testFile = join(root, 'round-trip.json');
      await writeJson(testFile, obj);
      const read = await readJson(testFile);
      expect(read).toEqual(obj);
    });

    it('round trip sync: writeJsonSync then readJsonSync returns deep-equal object', () => {
      const objSync = { foo: 'bar', baz: 123 };
      const testFileSync = join(root, 'round-trip-sync.json');
      writeJsonSync(testFileSync, objSync);
      const readSync = readJsonSync(testFileSync);
      expect(readSync).toEqual(objSync);
    });

    it('outputJson and outputJsonSync create missing parent dirs', async () => {
      const outObj = { a: 1 };
      const outFile = join(root, 'sub1/sub2/out.json');
      await outputJson(outFile, outObj);
      await expect(readJson(outFile)).resolves.toEqual(outObj);

      const outSyncObj = { b: 2 };
      const outSyncFile = join(root, 'sub3/sub4/out-sync.json');
      outputJsonSync(outSyncFile, outSyncObj);
      expect(readJsonSync(outSyncFile)).toEqual(outSyncObj);
    });

    it('a file with a BOM parses', async () => {
      const bomFile = join(root, 'bom.json');
      await fs.writeFile(bomFile, '\uFEFF{"bom":true}');
      const bomRead = await readJson(bomFile);
      expect(bomRead).toEqual({ bom: true });

      const bomSyncRead = readJsonSync(bomFile);
      expect(bomSyncRead).toEqual({ bom: true });
    });

    it('malformed JSON rejects JsonParseError with path and cause', async () => {
      const badFile = join(root, 'bad.json');
      await fs.writeFile(badFile, '{ bad json');
      let caughtErr: any = null;
      try {
        await readJson(badFile);
      } catch (e) {
        caughtErr = e;
      }
      expect(caughtErr).toBeInstanceOf(JsonParseError);
      expect(isJsonParseError(caughtErr)).toBe(true);
      expect(caughtErr.path).toBe(badFile);
      expect(caughtErr.cause).toBeInstanceOf(SyntaxError);

      let caughtSyncErr: any = null;
      try {
        readJsonSync(badFile);
      } catch (e) {
        caughtSyncErr = e;
      }
      expect(caughtSyncErr).toBeInstanceOf(JsonParseError);
      expect(isJsonParseError(caughtSyncErr)).toBe(true);
      expect(caughtSyncErr.path).toBe(badFile);
      expect(caughtSyncErr.cause).toBeInstanceOf(SyntaxError);
    });

    it('throws: false resolves null for malformed JSON and type includes null', async () => {
      const badFile = join(root, 'bad-throws-false.json');
      await fs.writeFile(badFile, '{ bad json');

      const res = await readJson(badFile, { throws: false });
      expect(res).toBeNull();
      const _typeCheck: null extends typeof res ? true : false = true;
      expect(_typeCheck).toBe(true);

      const resSync = readJsonSync(badFile, { throws: false });
      expect(resSync).toBeNull();
      const _typeCheckSync: null extends typeof resSync ? true : false = true;
      expect(_typeCheckSync).toBe(true);

      const noSuchFile = join(root, 'does-not-exist.json');
      const resMissing = await readJson(noSuchFile, { throws: false });
      expect(resMissing).toBeNull();
      const resSyncMissing = readJsonSync(noSuchFile, { throws: false });
      expect(resSyncMissing).toBeNull();
    });

    it('spaces and EOL affect the written bytes', async () => {
      const spacesFile = join(root, 'spaces.json');
      await writeJson(spacesFile, { a: 1 }, { spaces: 2, EOL: '\r\n' });
      const rawContent = await fs.readFile(spacesFile, 'utf8');
      expect(rawContent).toBe('{\r\n  "a": 1\r\n}\r\n');
    });

    it('reviver and replacer options work', async () => {
      const reviverFile = join(root, 'reviver.json');
      await writeJson(
        reviverFile,
        { a: '10', b: 'ignore' },
        {
          replacer: (k: string, v: any) => (k === 'b' ? undefined : v),
        },
      );
      const revived = await readJson(reviverFile, {
        reviver: (k: string, v: any) => (k === 'a' ? Number(v) : v),
      });
      expect(revived).toEqual({ a: 10 });
    });

    it('cancel readJson and writeJson rejects CancelError', async () => {
      const cancelFile = join(root, 'cancel.json');
      await writeJson(cancelFile, { data: 'test' });
      const pRead = readJson(cancelFile);
      pRead.cancel();
      await expect(pRead).rejects.toThrow(CancelError);

      const pWrite = writeJson(cancelFile, { data: 'test2' });
      pWrite.cancel();
      await expect(pWrite).rejects.toThrow(CancelError);
    });
  });
});
