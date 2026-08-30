import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as cp from './index';

describe('child-process exports', () => {
  it('exports functions matching the surface manifest and helpers', () => {
    const manifestPath = resolve(__dirname, '../../surface/child-process.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const manifestExports: string[] = manifest.exports.map((e: { name: string }) => e.name);

    for (const name of manifestExports) {
      expect(typeof (cp as Record<string, unknown>)[name]).toBe('function');
    }

    expect(typeof cp.killTree).toBe('function');
    expect((cp as Record<string, unknown>).default).toBeUndefined();
  });

  it('has no default export', () => {
    expect((cp as Record<string, unknown>).default).toBeUndefined();
  });
});
