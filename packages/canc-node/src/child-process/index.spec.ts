import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as cp from './index';

describe('child-process exports', () => {
  it('exports exactly the functions named in the surface manifest', () => {
    const manifestPath = resolve(__dirname, '../../surface/child-process.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const manifestExports: string[] = manifest.exports.map((entry: { name: string }) => entry.name);

    const runtimeExports = Object.keys(cp).filter(
      (name) => typeof (cp as Record<string, unknown>)[name] === 'function',
    );

    expect(runtimeExports.sort()).toEqual([...manifestExports].sort());
  });

  it('has no default export', () => {
    expect((cp as Record<string, unknown>).default).toBeUndefined();
  });
});
