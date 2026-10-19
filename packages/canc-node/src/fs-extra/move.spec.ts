import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CancelError } from '@cancjs/promise';

import { getFs, resetFs, setFs } from '../fs/registry';
import { move, moveSync } from './move';

type TFsCall = (...args: unknown[]) => unknown;

// registry members are typed uncallable on purpose, so the widening happens here and nowhere else
function fsCall(fn: unknown, name: string): TFsCall {
  if (typeof fn !== 'function') throw new Error(`fs registry has no ${name}`);
  return fn as TFsCall;
}

/**
 * Real fs calls run on real time, so yield to them and advance the fake clock only while a retry
 * timer is pending. Returns the fake milliseconds spent, which is the retry wait.
 */
async function settleWithFakeClock<T>(promise: PromiseLike<T>, stepMs = 25): Promise<number> {
  let settled = false;
  void promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  let spent = 0;
  while (!settled) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (!settled && jest.getTimerCount() > 0) {
      await jest.advanceTimersByTimeAsync(stepMs);
      spent += stepMs;
    }
  }
  return spent;
}

/** Overrides process.platform for one test; call the returned function to restore it. */
function forcePlatform(platform: NodeJS.Platform): () => void {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { ...original, value: platform });
  return () => Object.defineProperty(process, 'platform', original);
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

describe('move', () => {
  const root = join(tmpdir(), 'move-test-' + Math.random().toString(36).slice(2));

  beforeAll(async () => {
    await fs.mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await cleanDir(root);
  });

  afterEach(() => {
    resetFs();
  });

  it('same-device move uses rename and is atomic', async () => {
    const src = join(root, 'same-dev-src.txt');
    const dest = join(root, 'same-dev-dest.txt');
    await fs.writeFile(src, 'content');

    let renameCalled = false;
    const originalFs = getFs();
    const originalRename = fsCall(originalFs.rename, 'rename');
    setFs({
      ...originalFs,
      rename: (oldPath: string, newPath: string, cb: unknown) => {
        renameCalled = true;
        originalRename(oldPath, newPath, cb);
      },
    });

    await move(src, dest);
    expect(renameCalled).toBe(true);
    await expect(fs.readFile(dest, 'utf8')).resolves.toBe('content');
    await expect(fs.stat(src)).rejects.toThrow();
  });

  it('cross-device EXDEV falls back to copy then delete', async () => {
    const src = join(root, 'exdev-src.txt');
    const dest = join(root, 'exdev-dest.txt');
    await fs.writeFile(src, 'cross-device-content');

    let exdevTriggered = false;
    const originalFs = getFs();
    setFs({
      ...originalFs,
      rename: (_oldPath: string, _newPath: string, cb: any) => {
        exdevTriggered = true;
        const err: any = new Error('EXDEV: cross-device link not permitted');
        err.code = 'EXDEV';
        cb(err);
      },
    });

    await move(src, dest);
    expect(exdevTriggered).toBe(true);
    await expect(fs.readFile(dest, 'utf8')).resolves.toBe('cross-device-content');
    await expect(fs.stat(src)).rejects.toThrow();
  });

  it('cancel during the copy phase leaves the SOURCE intact', async () => {
    const srcDir = join(root, 'cancel-copy-src');
    const destDir = join(root, 'cancel-copy-dest');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(join(srcDir, 'a.txt'), 'file a');
    await fs.writeFile(join(srcDir, 'b.txt'), 'file b');

    const originalFs = getFs();
    setFs({
      ...originalFs,
      rename: (_oldPath: string, _newPath: string, cb: any) => {
        const err: any = new Error('EXDEV');
        err.code = 'EXDEV';
        cb(err);
      },
    });

    const p = move(srcDir, destDir);
    p.cancel();
    await expect(p).rejects.toThrow(CancelError);

    await expect(fs.readFile(join(srcDir, 'a.txt'), 'utf8')).resolves.toBe('file a');
    await expect(fs.readFile(join(srcDir, 'b.txt'), 'utf8')).resolves.toBe('file b');
  });

  it('cancel between copy and delete leaves both (recoverable)', async () => {
    const srcDir = join(root, 'cancel-between-src');
    const destDir = join(root, 'cancel-between-dest');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(join(srcDir, 'test.txt'), 'payload');

    const originalFs = getFs();
    setFs({
      ...originalFs,
      rename: (_oldPath: string, _newPath: string, cb: any) => {
        const err: any = new Error('EXDEV');
        err.code = 'EXDEV';
        cb(err);
      },
    });

    const movePromise = move(srcDir, destDir);
    setImmediate(() => {
      movePromise.cancel();
    });

    try {
      await movePromise;
    } catch (e) {
      expect(e).toBeInstanceOf(CancelError);
    }

    const srcExists = await fs.stat(srcDir).then(
      () => true,
      () => false,
    );
    expect(srcExists).toBe(true);
  });

  it('overwrite: false onto an existing target rejects EEXIST', async () => {
    const src = join(root, 'no-overwrite-src.txt');
    const dest = join(root, 'no-overwrite-dest.txt');
    await fs.writeFile(src, 'src content');
    await fs.writeFile(dest, 'dest content');

    let caughtErr: any = null;
    try {
      await move(src, dest, { overwrite: false });
    } catch (e) {
      caughtErr = e;
    }

    expect(caughtErr).toBeDefined();
    expect(caughtErr.code).toBe('EEXIST');
    await expect(fs.readFile(src, 'utf8')).resolves.toBe('src content');
    await expect(fs.readFile(dest, 'utf8')).resolves.toBe('dest content');
  });

  it('creates missing destination parent directories before moving', async () => {
    const src = join(root, 'nested-src.txt');
    const dest = join(root, 'nested/parent/sub/dest.txt');
    await fs.writeFile(src, 'nested content');

    await move(src, dest);
    await expect(fs.readFile(dest, 'utf8')).resolves.toBe('nested content');
    await expect(fs.stat(src)).rejects.toThrow();
  });

  it('retries on transient EBUSY errors', async () => {
    const src = join(root, 'retry-src.txt');
    const dest = join(root, 'retry-dest.txt');
    await fs.writeFile(src, 'retry content');

    let attempts = 0;
    const originalFs = getFs();
    const originalRename = fsCall(originalFs.rename, 'rename');
    setFs({
      ...originalFs,
      rename: (oldPath: string, newPath: string, cb: (err?: unknown) => void) => {
        attempts++;
        if (attempts < 3) {
          const err: any = new Error('EBUSY: resource busy or locked');
          err.code = 'EBUSY';
          cb(err);
          return;
        }
        originalRename(oldPath, newPath, cb);
      },
    });

    await move(src, dest);
    expect(attempts).toBe(3);
    await expect(fs.readFile(dest, 'utf8')).resolves.toBe('retry content');
  });

  it('surfaces EPERM that never clears without retrying off Windows', async () => {
    const src = join(root, 'eperm-src.txt');
    const dest = join(root, 'eperm-dest.txt');
    await fs.writeFile(src, 'eperm content');

    let renameAttempts = 0;
    const restorePlatform = forcePlatform('linux');
    const originalFs = getFs();
    setFs({
      ...originalFs,
      rename: (_oldPath: string, _newPath: string, cb: any) => {
        renameAttempts++;
        const err: any = new Error('EPERM: operation not permitted');
        err.code = 'EPERM';
        cb(err);
      },
    });

    try {
      await expect(move(src, dest)).rejects.toThrow();
    } finally {
      restorePlatform();
    }
    expect(renameAttempts).toBe(1);
  });

  it('rejects EEXIST by default when the destination exists', async () => {
    const src = join(root, 'default-src.txt');
    const dest = join(root, 'default-dest.txt');
    await fs.writeFile(src, 'src content');
    await fs.writeFile(dest, 'dest content');

    await expect(move(src, dest)).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(fs.readFile(src, 'utf8')).resolves.toBe('src content');
    await expect(fs.readFile(dest, 'utf8')).resolves.toBe('dest content');
  });

  it('replaces an existing destination with overwrite: true', async () => {
    const src = join(root, 'replace-src.txt');
    const dest = join(root, 'replace-dest.txt');
    await fs.writeFile(src, 'src content');
    await fs.writeFile(dest, 'dest content');

    await move(src, dest, { overwrite: true });
    await expect(fs.readFile(dest, 'utf8')).resolves.toBe('src content');
    await expect(fs.stat(src)).rejects.toThrow();
  });

  it('moveSync rejects EEXIST by default when the destination exists', () => {
    const src = join(root, 'sync-default-src.txt');
    const dest = join(root, 'sync-default-dest.txt');
    fsSync.writeFileSync(src, 'src content');
    fsSync.writeFileSync(dest, 'dest content');

    expect(() => moveSync(src, dest)).toThrow(expect.objectContaining({ code: 'EEXIST' }));
    expect(fsSync.readFileSync(dest, 'utf8')).toBe('dest content');
  });

  it('moveSync replaces an existing destination with overwrite: true', () => {
    const src = join(root, 'sync-replace-src.txt');
    const dest = join(root, 'sync-replace-dest.txt');
    fsSync.writeFileSync(src, 'src content');
    fsSync.writeFileSync(dest, 'dest content');

    moveSync(src, dest, { overwrite: true });
    expect(fsSync.readFileSync(dest, 'utf8')).toBe('src content');
    expect(fsSync.existsSync(src)).toBe(false);
  });

  describe('locked rename retry', () => {
    let restorePlatform: (() => void) | undefined;

    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
      });
    });

    afterEach(() => {
      restorePlatform?.();
      restorePlatform = undefined;
      jest.useRealTimers();
    });

    function stubRename(failures: number, code: string) {
      const state = { attempts: 0 };
      const originalFs = getFs();
      const originalRename = fsCall(originalFs.rename, 'rename');
      setFs({
        ...originalFs,
        rename: (oldPath: string, newPath: string, cb: (err?: unknown) => void) => {
          state.attempts++;
          if (state.attempts <= failures) {
            cb(Object.assign(new Error(code), { code }));
            return;
          }
          originalRename(oldPath, newPath, cb);
        },
      });
      return state;
    }

    it.each(['EPERM', 'EACCES'])('retries %s on win32 until the rename succeeds', async (code) => {
      const src = join(root, `locked-${code}-src.txt`);
      const dest = join(root, `locked-${code}-dest.txt`);
      await fs.writeFile(src, 'locked content');
      restorePlatform = forcePlatform('win32');
      const state = stubRename(2, code);

      const p = move(src, dest);
      await settleWithFakeClock(p);
      await p;

      expect(state.attempts).toBe(3);
      await expect(fs.readFile(dest, 'utf8')).resolves.toBe('locked content');
    });

    it('rejects within the budget when the rename stays locked on win32', async () => {
      const src = join(root, 'locked-forever-src.txt');
      const dest = join(root, 'locked-forever-dest.txt');
      await fs.writeFile(src, 'locked content');
      restorePlatform = forcePlatform('win32');
      const state = stubRename(30, 'EPERM');

      const settled = move(src, dest).then(
        () => 'resolved',
        (err: any) => err.code,
      );
      const spent = await settleWithFakeClock(settled);

      await expect(settled).resolves.toBe('EPERM');
      expect(spent).toBeLessThanOrEqual(1000);
      expect(state.attempts).toBeGreaterThan(2);
      expect(state.attempts).toBeLessThan(30);
      await expect(fs.readFile(src, 'utf8')).resolves.toBe('locked content');
    });

    it('does not retry EPERM off win32', async () => {
      const src = join(root, 'locked-linux-src.txt');
      const dest = join(root, 'locked-linux-dest.txt');
      await fs.writeFile(src, 'locked content');
      restorePlatform = forcePlatform('linux');
      const state = stubRename(2, 'EPERM');

      const settled = move(src, dest).then(
        () => 'resolved',
        (err: any) => err.code,
      );
      await settleWithFakeClock(settled);

      await expect(settled).resolves.toBe('EPERM');
      expect(state.attempts).toBe(1);
    });
  });

  it('moveSync on same device uses renameSync and does not call copyFileSync', () => {
    const src = join(root, 'sync-same-dev-src.txt');
    const dest = join(root, 'sync-same-dev-dest.txt');
    fsSync.writeFileSync(src, 'sync-content');

    let renameSyncCalled = false;
    let copyFileSyncCalled = false;
    const originalFs = getFs();
    const originalRenameSync = fsCall(originalFs.renameSync, 'renameSync');
    const originalCopyFileSync = fsCall(originalFs.copyFileSync, 'copyFileSync');
    setFs({
      ...originalFs,
      renameSync: (oldPath: string, newPath: string) => {
        renameSyncCalled = true;
        return originalRenameSync(oldPath, newPath);
      },
      copyFileSync: (srcPath: string, destPath: string, flags?: number) => {
        copyFileSyncCalled = true;
        return originalCopyFileSync(srcPath, destPath, flags);
      },
    });

    moveSync(src, dest);
    expect(renameSyncCalled).toBe(true);
    expect(copyFileSyncCalled).toBe(false);
    expect(fsSync.readFileSync(dest, 'utf8')).toBe('sync-content');
    expect(fsSync.existsSync(src)).toBe(false);
  });

  it('moveSync with EXDEV forced copies then deletes and destination is byte-identical', () => {
    const src = join(root, 'sync-exdev-src.bin');
    const dest = join(root, 'sync-exdev-dest.bin');
    const payload = Buffer.from('payload-with-bytes-\x00\x01\x02\xff');
    fsSync.writeFileSync(src, payload);

    let exdevTriggered = false;
    const originalFs = getFs();
    setFs({
      ...originalFs,
      renameSync: (_oldPath: string, _newPath: string) => {
        exdevTriggered = true;
        const err: any = new Error('EXDEV: cross-device link not permitted');
        err.code = 'EXDEV';
        throw err;
      },
    });

    moveSync(src, dest);
    expect(exdevTriggered).toBe(true);
    const destContent = fsSync.readFileSync(dest);
    expect(Buffer.compare(destContent, payload)).toBe(0);
    expect(fsSync.existsSync(src)).toBe(false);
  });

  it('leaves the source in place when the delete step fails', () => {
    const srcDir = join(root, 'sync-fail-rm-src');
    const destDir = join(root, 'sync-fail-rm-dest');
    fsSync.mkdirSync(srcDir, { recursive: true });
    fsSync.writeFileSync(join(srcDir, 'retained.txt'), 'retained content');

    const originalFs = getFs();
    setFs({
      ...originalFs,
      renameSync: () => {
        const err: any = new Error('EXDEV');
        err.code = 'EXDEV';
        throw err;
      },
      rmSync: () => {
        throw new Error('rmSync failed');
      },
    });

    expect(() => moveSync(srcDir, destDir)).toThrow('rmSync failed');

    expect(fsSync.existsSync(srcDir)).toBe(true);
    expect(fsSync.readFileSync(join(srcDir, 'retained.txt'), 'utf8')).toBe('retained content');
    expect(fsSync.existsSync(destDir)).toBe(true);
    expect(fsSync.readFileSync(join(destDir, 'retained.txt'), 'utf8')).toBe('retained content');
  });

  it('moveSync with overwrite: false onto an existing target throws EEXIST', () => {
    const src = join(root, 'sync-no-overwrite-src.txt');
    const dest = join(root, 'sync-no-overwrite-dest.txt');
    fsSync.writeFileSync(src, 'src content');
    fsSync.writeFileSync(dest, 'dest content');

    let caughtErr: any = null;
    try {
      moveSync(src, dest, { overwrite: false });
    } catch (e) {
      caughtErr = e;
    }

    expect(caughtErr).toBeDefined();
    expect(caughtErr.code).toBe('EEXIST');
    expect(fsSync.readFileSync(src, 'utf8')).toBe('src content');
    expect(fsSync.readFileSync(dest, 'utf8')).toBe('dest content');
  });

  it('moveSync creates missing destination parent directories before moving', () => {
    const src = join(root, 'sync-nested-src.txt');
    const dest = join(root, 'sync-nested/parent/sub/dest.txt');
    fsSync.writeFileSync(src, 'nested sync content');

    moveSync(src, dest);
    expect(fsSync.readFileSync(dest, 'utf8')).toBe('nested sync content');
    expect(fsSync.existsSync(src)).toBe(false);
  });

  describe('self and parent path guards', () => {
    let dir: string;

    beforeEach(async () => {
      dir = await fs.mkdtemp(join(tmpdir(), 'move-guard-'));
    });

    afterEach(async () => {
      await fs.rm(dir, { recursive: true, force: true });
    });

    it('move into its own subdirectory rejects and leaves no stray directory', async () => {
      const src = join(dir, 'src');
      await fs.mkdir(join(src, 'inner'), { recursive: true });
      const dest = join(src, 'sub');
      await expect(move(src, dest)).rejects.toThrow(`Cannot move '${src}' to a subdirectory of itself, '${dest}'.`);
      await expect(fs.stat(dest)).rejects.toThrow();
      await expect(fs.stat(join(src, 'inner'))).resolves.toBeDefined();
    });

    it('moveSync into its own subdirectory throws and leaves no stray directory', async () => {
      const src = join(dir, 'src');
      await fs.mkdir(join(src, 'inner'), { recursive: true });
      const dest = join(src, 'sub', 'deeper');
      expect(() => moveSync(src, dest)).toThrow(`Cannot move '${src}' to a subdirectory of itself, '${dest}'.`);
      await expect(fs.stat(join(src, 'sub'))).rejects.toThrow();
    });

    it('move onto itself rejects', async () => {
      const src = join(dir, 'file.txt');
      await fs.writeFile(src, 'x');
      await expect(move(src, src)).rejects.toThrow('Source and destination must not be the same.');
      expect(() => moveSync(src, src)).toThrow('Source and destination must not be the same.');
    });
  });
});
