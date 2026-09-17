import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CancelError } from '@cancjs/promise';

import { getFs, resetFs, setFs } from '../fs/registry';
import { replaceFile, replaceFileSync } from './replace-file';

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

  it('cancel removes the temp file with no leftovers in directory', async () => {
    const dir = join(root, 'cancel-cleanup-dir');
    await fs.mkdir(dir, { recursive: true });
    const file = join(dir, 'target.txt');
    await fs.writeFile(file, 'initial content');

    const p = replaceFile(file, 'x'.repeat(100000));
    p.cancel();
    await expect(p).rejects.toThrow(CancelError);

    const files = await fs.readdir(dir);
    expect(files).toEqual(['target.txt']);
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
});
