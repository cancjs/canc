import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CancelError } from '@cancjs/promise';

import { isJsonParseError, JsonParseError } from '../errors/classes';
import { exists, mkdir, writeFile } from '../fs';
import { getFs, resetFs, setFs } from '../fs/registry';
import {
  copy,
  emptyDir,
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
  replaceFile,
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

  describe('copy and emptyDir', () => {
    it('copies a nested tree, contents byte-identical', async () => {
      const src = join(root, 'copy-src');
      const dest = join(root, 'copy-dest');
      await fs.mkdir(join(src, 'sub'), { recursive: true });
      await fs.writeFile(join(src, 'file1.txt'), 'hello file 1');
      await fs.writeFile(join(src, 'sub', 'file2.txt'), 'hello file 2');

      await copy(src, dest);

      await expect(fs.readFile(join(dest, 'file1.txt'), 'utf8')).resolves.toBe('hello file 1');
      await expect(fs.readFile(join(dest, 'sub', 'file2.txt'), 'utf8')).resolves.toBe('hello file 2');
    });

    it('cancel mid-copy leaves a partial tree and rejects CancelError', async () => {
      const src = join(root, 'copy-cancel-src');
      const dest = join(root, 'copy-cancel-dest');
      await fs.mkdir(join(src, 'a'), { recursive: true });
      await fs.mkdir(join(src, 'b'), { recursive: true });
      await fs.writeFile(join(src, 'a', '1.txt'), 'content 1');
      await fs.writeFile(join(src, 'b', '2.txt'), 'content 2');

      const progressEntries: Array<{ src: string; dest: string }> = [];
      let copyP: any = null;

      copyP = copy(src, dest, {
        onProgress: (p) => {
          progressEntries.push(p);
          if (progressEntries.length === 1) {
            copyP.cancel();
          }
        },
      });

      await expect(copyP).rejects.toThrow(CancelError);
      expect(progressEntries.length).toBeGreaterThanOrEqual(1);

      const lastProgress = progressEntries[progressEntries.length - 1];
      const existsOnDisk = await fs
        .stat(lastProgress.dest)
        .then(() => true)
        .catch(() => false);
      expect(existsOnDisk).toBe(true);
    });

    it('filter returning false prunes a subtree without descending into it', async () => {
      const src = join(root, 'copy-filter-src');
      const dest = join(root, 'copy-filter-dest');
      await fs.mkdir(join(src, 'skip-dir'), { recursive: true });
      await fs.writeFile(join(src, 'skip-dir', 'hidden.txt'), 'hidden');
      await fs.writeFile(join(src, 'keep.txt'), 'keep');

      await copy(src, dest, {
        filter: (s) => !s.includes('skip-dir'),
      });

      await expect(fs.readFile(join(dest, 'keep.txt'), 'utf8')).resolves.toBe('keep');
      const skippedExists = await fs
        .stat(join(dest, 'skip-dir'))
        .then(() => true)
        .catch(() => false);
      expect(skippedExists).toBe(false);
    });

    it('emptyDir removes children and keeps the root', async () => {
      const emptyTarget = join(root, 'empty-target');
      await fs.mkdir(join(emptyTarget, 'child-dir'), { recursive: true });
      await fs.writeFile(join(emptyTarget, 'child.txt'), 'child file');
      await fs.writeFile(join(emptyTarget, 'child-dir', 'nested.txt'), 'nested');

      await emptyDir(emptyTarget);

      const rootStat = await fs.stat(emptyTarget);
      expect(rootStat.isDirectory()).toBe(true);

      const remainingEntries = await fs.readdir(emptyTarget);
      expect(remainingEntries).toEqual([]);
    });

    it('copy and emptyDir call the registered file system', async () => {
      const src = join(root, 'routed-src');
      const dest = join(root, 'routed-dest');
      await fs.mkdir(join(src, 'nested'), { recursive: true });
      await fs.writeFile(join(src, 'nested', 'routed.txt'), 'routed');

      const counts = { lstat: 0, readdir: 0, copyFile: 0 };
      const base = getFs();
      setFs({
        ...base,
        lstat: (...args: any[]) => {
          counts.lstat++;
          return base.lstat(...args);
        },
        readdir: (...args: any[]) => {
          counts.readdir++;
          return base.readdir(...args);
        },
        copyFile: (...args: any[]) => {
          counts.copyFile++;
          return base.copyFile(...args);
        },
      });

      let readdirAfterCopy = 0;
      try {
        await copy(src, dest);
        readdirAfterCopy = counts.readdir;
        await emptyDir(join(root, 'routed-empty'));
      } finally {
        resetFs();
      }

      expect(counts.lstat).toBeGreaterThan(0);
      expect(readdirAfterCopy).toBeGreaterThan(0);
      expect(counts.copyFile).toBeGreaterThan(0);
      expect(counts.readdir).toBeGreaterThan(readdirAfterCopy);
    });
  });

  describe('smoke test', () => {
    it('copy nested tree cancel leaves partial tree matching progress and replaceFile cleanup verified', async () => {
      const smokeSrc = join(root, 'smoke-tree-src');
      const smokeDest = join(root, 'smoke-tree-dest');

      await fs.mkdir(join(smokeSrc, 'd1'), { recursive: true });
      await fs.mkdir(join(smokeSrc, 'd2', 'nested'), { recursive: true });
      await fs.writeFile(join(smokeSrc, 'f1.txt'), 'file 1');
      await fs.writeFile(join(smokeSrc, 'd1', 'fa.txt'), 'file A');
      await fs.writeFile(join(smokeSrc, 'd2', 'nested', 'fb.txt'), 'file B');
      await fs.writeFile(join(smokeSrc, 'f2.txt'), 'file 2');

      const progressRecords: Array<{ src: string; dest: string }> = [];
      let activeCopy: any = null;

      activeCopy = copy(smokeSrc, smokeDest, {
        onProgress: (p) => {
          progressRecords.push(p);
          if (progressRecords.length === 2) {
            activeCopy.cancel();
          }
        },
      });

      await expect(activeCopy).rejects.toThrow(CancelError);
      expect(progressRecords.length).toBeGreaterThanOrEqual(2);

      const lastRecorded = progressRecords[progressRecords.length - 1];
      const recordedExists = await fs
        .stat(lastRecorded.dest)
        .then(() => true)
        .catch(() => false);
      expect(recordedExists).toBe(true);

      const replaceFileTarget = join(smokeDest, 'replace-smoke.txt');
      await fs.writeFile(replaceFileTarget, 'initial smoke data');

      const pReplace = replaceFile(replaceFileTarget, 'new smoke data');
      pReplace.cancel();
      await expect(pReplace).rejects.toThrow(CancelError);

      const entries = await fs.readdir(smokeDest, { recursive: true });
      const leftoverTemp = entries.filter((name) => name.includes('.tmp-') || name.startsWith('.'));
      expect(leftoverTemp).toEqual([]);
    });
  });
});
