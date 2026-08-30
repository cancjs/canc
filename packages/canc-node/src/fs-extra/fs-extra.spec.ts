import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { exists, mkdir } from '../fs';
import { ensureDir, ensureFile, outputFile, pathExists } from './index';

describe('fs-extra', () => {
  const root = join(tmpdir(), 'fs-extra-test-' + Math.random().toString(36).slice(2));

  beforeAll(async () => {
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('ensureDir on existing directory resolves', async () => {
    const dir = join(root, 'dir1');
    await mkdir(dir);
    await expect(ensureDir(dir)).resolves.toBeUndefined();
  });

  it('outputFile creates parents', async () => {
    const file = join(root, 'a/b/c/test.txt');
    await outputFile(file, 'hello');
    await expect(fs.readFile(file, 'utf8')).resolves.toBe('hello');
  });

  it('pathExists aliases exists', () => {
    expect(pathExists).toBe(exists);
  });
});
