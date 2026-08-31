import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CancelError } from '@cancjs/promise';

import { exists, mkdir, writeFile } from '../fs';
import { ensureDir, ensureFile, ensureLink, ensureSymlink, outputFile, pathExists } from './index';

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
});
