import * as fs from 'node:fs/promises';
import { dirname } from 'node:path';

import { mkdir, writeFile } from '../fs';

export const ensureDir = async (path: string): Promise<void> => {
  try {
    await mkdir(path, { recursive: true });
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
};

export const ensureFile = async (path: string): Promise<void> => {
  try {
    await fs.stat(path);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      await ensureDir(dirname(path));
      await writeFile(path, '');
    } else {
      throw err;
    }
  }
};

/** @deprecated Use ensureDir instead */
export const mkdirp = ensureDir;
/** @deprecated Use ensureDir instead */
export const mkdirs = ensureDir;
