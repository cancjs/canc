import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CancelError } from '@cancjs/promise';

import { isJsonParseError, JsonParseError } from '../errors/classes';
import { exists, mkdir, writeFile } from '../fs';
import { getFs, resetFs, setFs } from '../fs/registry';
import * as extra from './index';
import {
  copy,
  emptyDir,
  emptyDirSync,
  ensureDir,
  ensureDirSync,
  ensureFile,
  ensureFileSync,
  ensureLink,
  ensureLinkSync,
  ensureSymlink,
  ensureSymlinkSync,
  mkdirpSync,
  mkdirsSync,
  move,
  outputFile,
  outputFileSync,
  outputJson,
  outputJsonSync,
  pathExists,
  readJson,
  readJsonSync,
  replaceFile,
  writeJson,
  writeJsonSync,
} from './index';

type TFsCall = (...args: unknown[]) => unknown;

// registry members are typed uncallable on purpose, so the widening happens here and nowhere else
function fsCall(fn: unknown, name: string): TFsCall {
  if (typeof fn !== 'function') throw new Error(`fs registry has no ${name}`);
  return fn as TFsCall;
}

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

  it('all eight new sync functions are exported on the ESM namespace', () => {
    const expected = [
      'emptyDirSync',
      'ensureDirSync',
      'ensureFileSync',
      'ensureLinkSync',
      'ensureSymlinkSync',
      'mkdirpSync',
      'mkdirsSync',
      'outputFileSync',
    ];
    for (const name of expected) {
      expect(typeof (extra as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('ensureDirSync on existing directory returns and aliases match; on path whose parent is a file throws ENOTDIR', async () => {
    const dir = join(root, 'dir-sync-1');
    await mkdir(dir);
    expect(ensureDirSync(dir)).toBeUndefined();
    expect(mkdirsSync(dir)).toBeUndefined();
    expect(mkdirpSync(dir)).toBeUndefined();

    const filePath = join(root, 'parent-file-sync.txt');
    await writeFile(filePath, 'not a dir');
    const childDir = join(filePath, 'sub');
    let thrown: any = null;
    try {
      ensureDirSync(childDir);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).not.toBeNull();
    expect(thrown.code).toBe('ENOTDIR');
  });

  it('ensureFileSync creates parent dirs and empty file', async () => {
    const file = join(root, 'ensure-f-sync/a/b.txt');
    ensureFileSync(file);
    await expect(fs.readFile(file, 'utf8')).resolves.toBe('');
  });

  it('ensureFileSync and ensureFile on existing directory fail with EISDIR', async () => {
    const existingDir = join(root, 'existing-dir-for-eisdir');
    ensureDirSync(existingDir);

    await expect(ensureFile(existingDir)).rejects.toMatchObject({ code: 'EISDIR' });
    expect(() => ensureFileSync(existingDir)).toThrow(expect.objectContaining({ code: 'EISDIR' }));
  });

  it('ensureLinkSync creates hardlink and parent dirs', async () => {
    const src = join(root, 'src-link-sync.txt');
    await writeFile(src, 'content sync');
    const dest = join(root, 'dest-link-sync/sub/link.txt');
    ensureLinkSync(src, dest);
    await expect(fs.readFile(dest, 'utf8')).resolves.toBe('content sync');
  });

  it('ensureSymlinkSync creates symlink and parent dirs', async () => {
    const src = join(root, 'src-sym-sync.txt');
    await writeFile(src, 'sym-content sync');
    const dest = join(root, 'dest-sym-sync/sub/sym.txt');
    try {
      ensureSymlinkSync(src, dest, 'file');
      await expect(fs.readFile(dest, 'utf8')).resolves.toBe('sym-content sync');
    } catch (e: any) {
      if (process.platform === 'win32' && e.code === 'EPERM') {
        return;
      }
      throw e;
    }
  });

  it('outputFileSync creates missing parents then writes', async () => {
    const file = join(root, 'sync-out/a/b/c/test.txt');
    outputFileSync(file, 'hello sync');
    await expect(fs.readFile(file, 'utf8')).resolves.toBe('hello sync');
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
    });

    it('rejects a missing file even when throws is false', async () => {
      const noSuchFile = join(root, 'does-not-exist.json');
      await expect(readJson(noSuchFile, { throws: false })).rejects.toMatchObject({ code: 'ENOENT' });
      let caughtSync: any;
      try {
        readJsonSync(noSuchFile, { throws: false });
      } catch (err) {
        caughtSync = err;
      }
      expect(caughtSync).toBeDefined();
      expect(caughtSync.code).toBe('ENOENT');
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

      const arrayReplacerFile = join(root, 'array-replacer.json');
      await writeJson(arrayReplacerFile, { a: 1, b: 2, c: 3 }, { replacer: ['a', 'c'] });
      const readArrayReplacer = await readJson(arrayReplacerFile);
      expect(readArrayReplacer).toEqual({ a: 1, c: 3 });
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

    it('skips an existing destination file when overwrite is false', async () => {
      const src = join(root, 'copy-skip-src');
      const dest = join(root, 'copy-skip-dest');
      await fs.mkdir(join(src, 'sub'), { recursive: true });
      await fs.mkdir(join(dest, 'sub'), { recursive: true });
      await fs.writeFile(join(src, 'existing.txt'), 'new content 1');
      await fs.writeFile(join(dest, 'existing.txt'), 'old content 1');
      await fs.writeFile(join(src, 'sub', 'existing2.txt'), 'new content 2');
      await fs.writeFile(join(dest, 'sub', 'existing2.txt'), 'old content 2');
      await fs.writeFile(join(src, 'copied.txt'), 'new file content');
      await fs.writeFile(join(src, 'sub', 'copied2.txt'), 'new nested file content');

      const progressEntries: Array<{ src: string; dest: string }> = [];

      await copy(src, dest, {
        overwrite: false,
        onProgress: (p) => {
          progressEntries.push(p);
        },
      });

      // existing destination files untouched
      await expect(fs.readFile(join(dest, 'existing.txt'), 'utf8')).resolves.toBe('old content 1');
      await expect(fs.readFile(join(dest, 'sub', 'existing2.txt'), 'utf8')).resolves.toBe('old content 2');

      // other files copied
      await expect(fs.readFile(join(dest, 'copied.txt'), 'utf8')).resolves.toBe('new file content');
      await expect(fs.readFile(join(dest, 'sub', 'copied2.txt'), 'utf8')).resolves.toBe('new nested file content');

      // onProgress must NOT fire for skipped entries
      expect(progressEntries.some((e) => e.dest.endsWith('existing.txt'))).toBe(false);
      expect(progressEntries.some((e) => e.dest.endsWith('existing2.txt'))).toBe(false);
      expect(progressEntries.some((e) => e.dest.endsWith('copied.txt'))).toBe(true);
      expect(progressEntries.some((e) => e.dest.endsWith('copied2.txt'))).toBe(true);
    });

    it('rejects EEXIST when overwrite is false and errorOnExist is true', async () => {
      const src = join(root, 'copy-err-src');
      const dest = join(root, 'copy-err-dest');
      await fs.mkdir(src, { recursive: true });
      await fs.mkdir(dest, { recursive: true });
      await fs.writeFile(join(src, 'file.txt'), 'src data');
      await fs.writeFile(join(dest, 'file.txt'), 'dest data');

      let caughtErr: any = null;
      try {
        await copy(src, dest, { overwrite: false, errorOnExist: true });
      } catch (err) {
        caughtErr = err;
      }
      expect(caughtErr).toBeDefined();
      expect(caughtErr.code).toBe('EEXIST');
      await expect(fs.readFile(join(dest, 'file.txt'), 'utf8')).resolves.toBe('dest data');
    });

    const isWindows = process.platform === 'win32';
    const symlinkTest = isWindows ? it.skip : it;

    symlinkTest(
      'symlink branch skips existing destination under overwrite: false [skipped on Windows: symlink creation requires elevated privileges]',
      async () => {
        const src = join(root, 'sym-skip-src');
        const dest = join(root, 'sym-skip-dest');
        await fs.mkdir(src, { recursive: true });
        await fs.mkdir(dest, { recursive: true });
        const target = join(root, 'sym-target.txt');
        await fs.writeFile(target, 'target');
        await fs.symlink(target, join(src, 'link.txt'));
        await fs.writeFile(join(dest, 'link.txt'), 'original dest');

        const progress: string[] = [];
        await copy(src, dest, {
          overwrite: false,
          onProgress: (p) => progress.push(p.dest),
        });

        await expect(fs.readFile(join(dest, 'link.txt'), 'utf8')).resolves.toBe('original dest');
        expect(progress.some((d) => d.endsWith('link.txt'))).toBe(false);
      },
    );

    symlinkTest(
      'symlink branch rejects EEXIST under overwrite: false and errorOnExist: true [skipped on Windows: symlink creation requires elevated privileges]',
      async () => {
        const src = join(root, 'sym-err-src');
        const dest = join(root, 'sym-err-dest');
        await fs.mkdir(src, { recursive: true });
        await fs.mkdir(dest, { recursive: true });
        const target = join(root, 'sym-target2.txt');
        await fs.writeFile(target, 'target');
        await fs.symlink(target, join(src, 'link.txt'));
        await fs.writeFile(join(dest, 'link.txt'), 'original dest');

        let caughtErr: any = null;
        try {
          await copy(src, dest, { overwrite: false, errorOnExist: true });
        } catch (err) {
          caughtErr = err;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.code).toBe('EEXIST');
      },
    );

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

    it('emptyDirSync removes children and keeps the root', async () => {
      const emptyTarget = join(root, 'empty-target-sync');
      await fs.mkdir(join(emptyTarget, 'child-dir'), { recursive: true });
      await fs.writeFile(join(emptyTarget, 'child.txt'), 'child file');
      await fs.writeFile(join(emptyTarget, 'child-dir', 'nested.txt'), 'nested');

      emptyDirSync(emptyTarget);

      const rootStat = await fs.stat(emptyTarget);
      expect(rootStat.isDirectory()).toBe(true);

      const remainingEntries = await fs.readdir(emptyTarget);
      expect(remainingEntries).toEqual([]);
    });

    it('each new sync function routes through setFs', () => {
      const counts = {
        mkdirSync: 0,
        statSync: 0,
        lstatSync: 0,
        writeFileSync: 0,
        linkSync: 0,
        symlinkSync: 0,
        readdirSync: 0,
        rmSync: 0,
      };
      const base = getFs();
      const baseMkdirSync = fsCall(base.mkdirSync, 'mkdirSync');
      const baseStatSync = fsCall(base.statSync, 'statSync');
      const baseLstatSync = fsCall(base.lstatSync, 'lstatSync');
      const baseWriteFileSync = fsCall(base.writeFileSync, 'writeFileSync');
      const baseLinkSync = fsCall(base.linkSync, 'linkSync');
      const baseSymlinkSync = fsCall(base.symlinkSync, 'symlinkSync');
      const baseReaddirSync = fsCall(base.readdirSync, 'readdirSync');
      const baseRmSync = fsCall(base.rmSync, 'rmSync');
      setFs({
        ...base,
        mkdirSync: (...args: unknown[]) => {
          counts.mkdirSync++;
          return baseMkdirSync(...args);
        },
        statSync: (...args: unknown[]) => {
          counts.statSync++;
          return baseStatSync(...args);
        },
        lstatSync: (...args: unknown[]) => {
          counts.lstatSync++;
          return baseLstatSync(...args);
        },
        writeFileSync: (...args: unknown[]) => {
          counts.writeFileSync++;
          return baseWriteFileSync(...args);
        },
        linkSync: (...args: unknown[]) => {
          counts.linkSync++;
          return baseLinkSync(...args);
        },
        symlinkSync: (...args: unknown[]) => {
          counts.symlinkSync++;
          return baseSymlinkSync(...args);
        },
        readdirSync: (...args: unknown[]) => {
          counts.readdirSync++;
          return baseReaddirSync(...args);
        },
        rmSync: (...args: unknown[]) => {
          counts.rmSync++;
          return baseRmSync(...args);
        },
      });

      try {
        ensureDirSync(join(root, 'routed-dir-sync'));
        expect(counts.mkdirSync).toBeGreaterThan(0);

        const prevStat = counts.statSync;
        ensureFileSync(join(root, 'routed-file-sync.txt'));
        expect(counts.statSync).toBeGreaterThan(prevStat);

        const linkSrc = join(root, 'routed-src.txt');
        ensureFileSync(linkSrc);
        const prevLstat = counts.lstatSync;
        ensureLinkSync(linkSrc, join(root, 'routed-dst.txt'));
        expect(counts.lstatSync).toBeGreaterThan(prevLstat);

        const prevLstatSym = counts.lstatSync;
        try {
          ensureSymlinkSync(linkSrc, join(root, 'routed-sym-dst.txt'), 'file');
        } catch (e: any) {
          if (process.platform !== 'win32' || e.code !== 'EPERM') {
            throw e;
          }
        }
        expect(counts.lstatSync).toBeGreaterThan(prevLstatSym);

        const prevWrite = counts.writeFileSync;
        outputFileSync(join(root, 'routed-out-sync.txt'), 'data');
        expect(counts.writeFileSync).toBeGreaterThan(prevWrite);

        const emptyTarget = join(root, 'routed-empty-sync');
        ensureDirSync(emptyTarget);
        const prevReaddir = counts.readdirSync;
        emptyDirSync(emptyTarget);
        expect(counts.readdirSync).toBeGreaterThan(prevReaddir);
      } finally {
        resetFs();
      }
    });

    it('copy and emptyDir call the registered file system', async () => {
      const src = join(root, 'routed-src');
      const dest = join(root, 'routed-dest');
      await fs.mkdir(join(src, 'nested'), { recursive: true });
      await fs.writeFile(join(src, 'nested', 'routed.txt'), 'routed');

      const counts = { lstat: 0, readdir: 0, copyFile: 0 };
      const base = getFs();
      const baseLstat = fsCall(base.lstat, 'lstat');
      const baseReaddir = fsCall(base.readdir, 'readdir');
      const baseCopyFile = fsCall(base.copyFile, 'copyFile');
      setFs({
        ...base,
        lstat: (...args: unknown[]) => {
          counts.lstat++;
          return baseLstat(...args);
        },
        readdir: (...args: unknown[]) => {
          counts.readdir++;
          return baseReaddir(...args);
        },
        copyFile: (...args: unknown[]) => {
          counts.copyFile++;
          return baseCopyFile(...args);
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

    it('cancel abandons an in-flight lstat instead of letting its late callback drive the tree forward', async () => {
      const src = join(root, 'copy-abandon-src');
      const dest = join(root, 'copy-abandon-dest');
      await fs.mkdir(src, { recursive: true });
      await fs.writeFile(join(src, 'file.txt'), 'content');
      const srcStats = await fs.lstat(src);

      const base = getFs();
      let pendingArgs: any[] | null = null;
      const readdirCalls: any[] = [];
      const baseReaddir = fsCall(base.readdir, 'readdir');
      setFs({
        ...base,
        // holds the callback instead of invoking it: stands in for a syscall still in flight
        lstat: (...args: any[]) => {
          pendingArgs = args;
        },
        readdir: (...args: unknown[]) => {
          readdirCalls.push(args);
          return baseReaddir(...args);
        },
      });

      try {
        const p = copy(src, dest);
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(pendingArgs).not.toBeNull();

        p.cancel();
        await expect(p).rejects.toThrow(CancelError);

        // release the held callback well after cancellation, as a real syscall would eventually do
        const callback = pendingArgs![pendingArgs!.length - 1];
        callback(null, srcStats);
        await new Promise((resolve) => setTimeout(resolve, 10));

        // a properly abandoned call never lets copyTree reach the next step
        expect(readdirCalls.length).toBe(0);
      } finally {
        resetFs();
      }
    });

    it('cancel abandons an in-flight move lstat instead of letting its late callback drive the fallback forward', async () => {
      const src = join(root, 'move-abandon-src');
      const dest = join(root, 'move-abandon-dest');
      await fs.writeFile(src, 'content');
      await fs.writeFile(dest, 'existing');
      const destStats = await fs.lstat(dest);

      const base = getFs();
      let pendingArgs: any[] | null = null;
      const renameCalls: any[] = [];
      const baseRename = fsCall(base.rename, 'rename');
      setFs({
        ...base,
        lstat: (...args: any[]) => {
          pendingArgs = args;
        },
        rename: (...args: unknown[]) => {
          renameCalls.push(args);
          return baseRename(...args);
        },
      });

      try {
        const p = move(src, dest, { overwrite: false });
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(pendingArgs).not.toBeNull();

        p.cancel();
        await expect(p).rejects.toThrow(CancelError);

        const callback = pendingArgs![pendingArgs!.length - 1];
        callback(null, destStats);
        await new Promise((resolve) => setTimeout(resolve, 10));

        // a properly abandoned call never lets move proceed past the existence check
        expect(renameCalls.length).toBe(0);
      } finally {
        resetFs();
      }
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
