import { dirname } from 'node:path';

import { writeFile } from '../fs';
import { ensureDir } from './ensure';

export const outputFile = async (path: string, data: any): Promise<void> => {
  await ensureDir(dirname(path));
  await writeFile(path, data);
};
