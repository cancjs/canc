import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CancelError } from '@cancjs/promise';

import { getFs, resetFs, setFs } from '../fs/registry';
import { replaceFile, replaceFileSync } from './replace-file';

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

describe('replaceFile', () => {
  const root = join(tmpdir(), 'replace-file-test-' + Math.random().toString(36).slice(2));

  beforeAll(async () => {
    await fs.mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await cleanDir(root);
  });

  afterEach(() => {
    resetFs();
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

    it('retries EPERM on win32 until the rename succeeds', async () => {
      const file = join(root, 'locked-replace.txt');
      await fs.writeFile(file, 'old');
      restorePlatform = forcePlatform('win32');
      const state = stubRename(2, 'EPERM');

      const p = replaceFile(file, 'new');
      await settleWithFakeClock(p);
      await p;

      expect(state.attempts).toBe(3);
      await expect(fs.readFile(file, 'utf8')).resolves.toBe('new');
    });

    it('rejects within the budget and removes the temp file when the rename stays locked', async () => {
      const dir = join(root, 'locked-replace-forever');
      await fs.mkdir(dir, { recursive: true });
      const file = join(dir, 'target.txt');
      await fs.writeFile(file, 'old');
      restorePlatform = forcePlatform('win32');
      const state = stubRename(30, 'EPERM');

      const settled = replaceFile(file, 'new').then(
        () => 'resolved',
        (err: any) => err.code,
      );
      const spent = await settleWithFakeClock(settled);

      await expect(settled).resolves.toBe('EPERM');
      expect(spent).toBeLessThanOrEqual(1000);
      expect(state.attempts).toBeGreaterThan(2);
      expect(state.attempts).toBeLessThan(30);
      await expect(fs.readFile(file, 'utf8')).resolves.toBe('old');
      await expect(fs.readdir(dir)).resolves.toEqual(['target.txt']);
    });

    it('does not retry EPERM off win32', async () => {
      const file = join(root, 'locked-replace-linux.txt');
      await fs.writeFile(file, 'old');
      restorePlatform = forcePlatform('linux');
      const state = stubRename(2, 'EPERM');

      const settled = replaceFile(file, 'new').then(
        () => 'resolved',
        (err: any) => err.code,
      );
      await settleWithFakeClock(settled);

      await expect(settled).resolves.toBe('EPERM');
      expect(state.attempts).toBe(1);
    });
  });

  it('writes content when target does not exist', async () => {
    const file = join(root, 'new-file.txt');
    await replaceFile(file, 'hello world');
    const content = await fs.readFile(file, 'utf8');
    expect(content).toBe('hello world');
  });

  it('replaces content when target exists', async () => {
    const file = join(root, 'existing-file.txt');
    await fs.writeFile(file, 'initial content');
    await replaceFile(file, 'updated content');
    const content = await fs.readFile(file, 'utf8');
    expect(content).toBe('updated content');
  });

  it('target contains either old or new content, never a mix on repeated cancellation', async () => {
    const dir = join(root, 'cancel-all-or-nothing');
    await fs.mkdir(dir, { recursive: true });

    for (let i = 0; i < 5; i++) {
      const file = join(dir, `target-${i}.txt`);
      const oldContent = 'OLD_CONTENT_' + i;
      const newContent = 'NEW_CONTENT_'.repeat(5000) + i;
      await fs.writeFile(file, oldContent, 'utf8');

      const p = replaceFile(file, newContent, 'utf8');
      if (i % 2 === 0) {
        p.cancel();
      } else {
        setImmediate(() => {
          void p.cancel();
        });
      }

      try {
        await p;
      } catch (err) {
        expect(err).toBeInstanceOf(CancelError);
      }

      const currentContent = await fs.readFile(file, 'utf8');
      expect(currentContent === oldContent || currentContent === newContent).toBe(true);
    }
  });

  it('cancel while write is in flight removes the temp file with no leftovers in directory', async () => {
    const dir = join(root, 'cancel-cleanup-inflight');
    await fs.mkdir(dir, { recursive: true });
    const file = join(dir, 'target.txt');
    await fs.writeFile(file, 'initial content');

    let writeStartedResolve!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      writeStartedResolve = resolve;
    });

    const originalFs = getFs();
    const originalWriteFile = fsCall(originalFs.writeFile, 'writeFile');
    const originalWriteFilePromise = fsCall(originalFs.promises?.writeFile, 'promises.writeFile');
    setFs({
      ...originalFs,
      writeFile: (filePath: any, data: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        const opts = typeof options === 'function' ? {} : options;
        originalWriteFile(filePath, data, opts, (...args: unknown[]) => {
          writeStartedResolve();
          setTimeout(() => {
            cb(...args);
          }, 50);
        });
      },
      promises: {
        ...originalFs.promises,
        writeFile: async (...args: unknown[]) => {
          const res = await originalWriteFilePromise(...args);
          writeStartedResolve();
          await new Promise((resolve) => setTimeout(resolve, 50));
          return res;
        },
      },
    });

    try {
      const p = replaceFile(file, 'x'.repeat(10000));
      await writeStarted;
      await p.cancel();
      await expect(p).rejects.toThrow(CancelError);

      const files = await fs.readdir(dir);
      expect(files).toEqual(['target.txt']);
    } finally {
      resetFs();
    }
  });

  const isWindows = process.platform === 'win32';
  const modeTest = isWindows ? it.skip : it;

  modeTest(
    'existing target mode is preserved [skipped on Windows: POSIX file modes not supported on Windows]',
    async () => {
      const file = join(root, 'mode-preserve.txt');
      await fs.writeFile(file, 'initial content', { mode: 0o755 });
      await replaceFile(file, 'new content');

      const st = await fs.stat(file);
      expect(st.mode & 0o777).toBe(0o755);
    },
  );

  it('a symlink target is REPLACED, not written through', async () => {
    const realFile = join(root, 'real-target.txt');
    const linkFile = join(root, 'link-target.txt');
    await fs.writeFile(realFile, 'real content', 'utf8');

    try {
      await fs.symlink(realFile, linkFile);
    } catch (e: any) {
      if (process.platform === 'win32' && (e.code === 'EPERM' || e.code === 'EACCES')) {
        // Windows unprivileged symlink skip
        return;
      }
      throw e;
    }

    await replaceFile(linkFile, 'new content via replaceFile', 'utf8');

    const realContent = await fs.readFile(realFile, 'utf8');
    expect(realContent).toBe('real content');

    const linkLstat = await fs.lstat(linkFile);
    expect(linkLstat.isSymbolicLink()).toBe(false);

    const linkContent = await fs.readFile(linkFile, 'utf8');
    expect(linkContent).toBe('new content via replaceFile');
  });

  it('replaceFileSync writes content when target does not exist', () => {
    const file = join(root, 'sync-new-file.txt');
    replaceFileSync(file, 'hello sync world');
    expect(fsSync.readFileSync(file, 'utf8')).toBe('hello sync world');
  });

  it('replaceFileSync replaces content when target exists', () => {
    const file = join(root, 'sync-existing-file.txt');
    fsSync.writeFileSync(file, 'initial sync content');
    replaceFileSync(file, 'updated sync content');
    expect(fsSync.readFileSync(file, 'utf8')).toBe('updated sync content');
  });

  it('replaceFileSync leaves target holding old content and leaves no temp file on failure', () => {
    const dir = join(root, 'sync-rename-failure-dir');
    fsSync.mkdirSync(dir, { recursive: true });
    const file = join(dir, 'target.txt');
    fsSync.writeFileSync(file, 'initial content');

    const originalFs = getFs();
    setFs({
      ...originalFs,
      renameSync: () => {
        throw new Error('simulated renameSync failure');
      },
    });

    expect(() => replaceFileSync(file, 'new content')).toThrow('simulated renameSync failure');

    const files = fsSync.readdirSync(dir);
    expect(files).toEqual(['target.txt']);
    expect(fsSync.readFileSync(file, 'utf8')).toBe('initial content');
  });

  modeTest(
    'replaceFileSync preserves existing target mode [skipped on Windows: POSIX file modes not supported on Windows]',
    () => {
      const file = join(root, 'sync-mode-preserve.txt');
      fsSync.writeFileSync(file, 'initial content', { mode: 0o755 });
      replaceFileSync(file, 'new content');

      const st = fsSync.statSync(file);
      expect(st.mode & 0o777).toBe(0o755);
    },
  );

  it('removes a temporary file that lands after the cancelation', async () => {
    const file = join(root, 'late-write.txt');
    await fs.writeFile(file, 'initial content');

    // the platform write is delayed, so cancel runs before the temp file exists and the write
    // creates it afterwards; an unlink that reads ENOENT as success leaves the file behind
    // the callback-style top-level member is what the wrappers reach through, not `promises`
    const originalFs = getFs();
    const realWriteFile = fsCall((originalFs as unknown as Record<string, unknown>).writeFile, 'writeFile');
    setFs({
      ...originalFs,
      writeFile: (...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: unknown) => void;
        const rest = args.slice(0, -1);
        setTimeout(() => realWriteFile(...rest, callback), 60);
      },
    } as never);

    const pending = replaceFile(file, 'new content');
    await pending.cancel();
    await pending.catch(() => undefined);

    await new Promise((resolve) => setTimeout(resolve, 400));

    const leftovers = (await fs.readdir(root)).filter((name) => name.includes('.tmp-'));
    expect(leftovers).toEqual([]);
  });
  it('a canceled write that lands after the cleanup retries give up still leaves no temp file behind', async () => {
    const dir = join(root, 'cancel-late-write');
    await fs.mkdir(dir, { recursive: true });
    const file = join(dir, 'target.txt');
    await fs.writeFile(file, 'initial content');

    // the platform write creates the temp file only after 1.5s, far past the ~0.5s unlink retry budget,
    // so a cleanup that gives up early leaves the file the write creates behind
    let writeLandedResolve!: () => void;
    const writeLanded = new Promise<void>((resolve) => {
      writeLandedResolve = resolve;
    });

    const originalFs = getFs();
    const realWriteFile = fsCall((originalFs as unknown as Record<string, unknown>).writeFile, 'writeFile');
    setFs({
      ...originalFs,
      writeFile: (...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: unknown) => void;
        const [target, data, options] = args.slice(0, -1);
        // the signal is dropped: node would otherwise abort the late write that the cancel already reached
        const lateOptions =
          typeof options === 'object' && options !== null ? { ...options, signal: undefined } : options;
        setTimeout(() => {
          realWriteFile(target, data, lateOptions, (err: unknown) => {
            writeLandedResolve();
            callback(err);
          });
        }, 1500);
      },
    } as never);

    try {
      const p = replaceFile(file, 'x'.repeat(10000));
      // awaiting cancel() covers the cleanup, which waits for the late write to land
      await p.cancel();

      await expect(p).rejects.toThrow(CancelError);
      await writeLanded;
      const leftovers = (await fs.readdir(dir)).filter((name) => name.includes('.tmp-'));
      expect(leftovers).toEqual([]);
      expect(await fs.readFile(file, 'utf8')).toBe('initial content');
    } finally {
      resetFs();
    }
  });

  describe('failure reporting', () => {
    function stubUnlinkFailure(code: string) {
      const originalFs = getFs();
      setFs({
        ...originalFs,
        promises: {
          ...originalFs.promises,
          unlink: (path: string) =>
            Promise.reject(Object.assign(new Error(`simulated cleanup failure for ${path}`), { code })),
        },
        unlinkSync: () => {
          throw Object.assign(new Error('simulated sync cleanup failure'), { code });
        },
      } as never);
    }

    it('rejects with the write error when the cleanup fails too', async () => {
      const target = join(root, 'missing-dir-async', 'f.txt');
      stubUnlinkFailure('EIO');

      await expect(replaceFile(target, 'new')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('replaceFileSync throws the write error when the cleanup fails too', () => {
      const target = join(root, 'missing-dir-sync', 'f.txt');
      stubUnlinkFailure('EIO');

      expect(() => replaceFileSync(target, 'new')).toThrow(expect.objectContaining({ code: 'ENOENT' }));
    });
  });

  describe('append flag', () => {
    it.each(['a', 'a+', 'as', 'ax+'])('rejects flag %s and leaves the target untouched', async (flag) => {
      const dir = join(root, `append-async-${flag.replace('+', 'p')}`);
      await fs.mkdir(dir, { recursive: true });
      const file = join(dir, 'target.txt');
      await fs.writeFile(file, 'old');

      await expect(replaceFile(file, 'new', { flag })).rejects.toMatchObject({
        name: 'TypeError',
        code: 'ERR_INVALID_ARG_VALUE',
      });

      await expect(fs.readFile(file, 'utf8')).resolves.toBe('old');
      await expect(fs.readdir(dir)).resolves.toEqual(['target.txt']);
    });

    it('rejects a numeric flag carrying O_APPEND', async () => {
      const file = join(root, 'append-numeric.txt');
      await fs.writeFile(file, 'old');
      const flag = fsSync.constants.O_WRONLY | fsSync.constants.O_CREAT | fsSync.constants.O_APPEND;

      await expect(replaceFile(file, 'new', { flag })).rejects.toMatchObject({ code: 'ERR_INVALID_ARG_VALUE' });
      await expect(fs.readFile(file, 'utf8')).resolves.toBe('old');
    });

    it('replaceFileSync throws on the append flag and leaves the target untouched', () => {
      const dir = join(root, 'append-sync');
      fsSync.mkdirSync(dir, { recursive: true });
      const file = join(dir, 'target.txt');
      fsSync.writeFileSync(file, 'old');

      expect(() => replaceFileSync(file, 'new', { flag: 'a' })).toThrow(
        expect.objectContaining({ name: 'TypeError', code: 'ERR_INVALID_ARG_VALUE' }),
      );

      expect(fsSync.readdirSync(dir)).toEqual(['target.txt']);
      expect(fsSync.readFileSync(file, 'utf8')).toBe('old');
    });

    it('still accepts a plain write flag', async () => {
      const file = join(root, 'plain-flag.txt');
      await fs.writeFile(file, 'old');

      await replaceFile(file, 'new', { flag: 'w' });

      await expect(fs.readFile(file, 'utf8')).resolves.toBe('new');
    });
  });
});
