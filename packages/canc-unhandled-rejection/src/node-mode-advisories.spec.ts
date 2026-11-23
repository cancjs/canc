import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { promiseSrc, unhandledSrc } from '../test/child-process.helper';

jest.setTimeout(30000);

function run(mode: string, callback: boolean, warn: boolean, canceled: boolean) {
  const code = [
    "const { registerNode } = require('@cancjs/unhandled-rejection');",
    "const { CancelError } = require('@cancjs/promise');",
    'let callbacks = 0;',
    'process.on("exit", () => console.log("CALLBACKS:" + callbacks));',
    'registerNode({ warn: ' + warn + (callback ? ', onUnhandledRejection() { callbacks++; }' : '') + ' });',
    'Promise.reject(' + (canceled ? 'new CancelError("CANCEL_MARKER")' : 'new Error("REAL_MARKER")') + ');',
  ].join('\n');
  const result = spawnSync(
    process.execPath,
    ['--unhandled-rejections=' + mode, '-r', path.resolve(__dirname, 'fixtures', 'ts-hook.js'), '-e', code],
    {
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        CANC_FIXTURE_TS: require.resolve('typescript'),
        CANC_FIXTURE_PROMISE: promiseSrc,
        CANC_FIXTURE_UNHANDLED: unhandledSrc,
      },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  expect(result.error).toBeUndefined();
  return result;
}

describe('Node rejection mode advisories', () => {
  it.each([true, false])('strict is fatal before callback, callback configured=%s', (callback) => {
    const result = run('strict', callback, true, true);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('CALLBACKS:0');
    expect(result.stderr).toContain('CancelError');
    expect(result.stderr.match(/\[@cancjs\/unhandled-rejection\].*inert/g)).toHaveLength(1);
  });

  it('warn:false disables only the package strict advisory', () => {
    const result = run('strict', true, false, true);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('CALLBACKS:0');
    expect(result.stderr).not.toContain('[@cancjs/unhandled-rejection]');
  });

  it('warn:false does not disable native cancellation warnings', () => {
    const result = run('warn', false, false, true);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('CALLBACKS:0');
    expect(result.stderr).toContain('UnhandledPromiseRejectionWarning');
    expect(result.stderr).toContain('CancelError');
    expect(result.stderr).not.toContain('[@cancjs/unhandled-rejection]');
  });

  it('warn retains both native and configured package diagnostics for genuine errors', () => {
    const result = run('warn', false, true, false);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('UnhandledPromiseRejectionWarning');
    expect(result.stderr).toMatch(/\[@cancjs\/unhandled-rejection\].*REAL_MARKER/);
  });

  it.each([
    ['warn-with-error-code', 1],
    ['none', 0],
    ['throw', 1],
  ] as const)('preserves genuine failure outcome in %s', (mode, status) => {
    const result = run(mode, false, true, false);
    expect(result.status).toBe(status);
    expect(result.stderr).toContain('REAL_MARKER');
    expect(result.stdout).toContain('CALLBACKS:0');
  });

  it('documents the strict callback limit and scope of warn:false', () => {
    const readme = readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');
    expect(readme).not.toContain('keep the process alive regardless of the mode');
    expect(readme).toContain('a custom onUnhandledRejection callback cannot keep the process alive in that mode');
    expect(readme).toContain('does not change Node');
  });
});
