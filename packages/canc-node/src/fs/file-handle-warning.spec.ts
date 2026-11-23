import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const hook = `
  const ts = require(${JSON.stringify(require.resolve('typescript'))});
  const Module = require('node:module');
  const fs = require('node:fs');
  const original = Module._resolveFilename;
  Module._resolveFilename = function (name, ...rest) {
    if (name === '@cancjs/promise') return ${JSON.stringify(resolve(__dirname, '../../../canc-promise/src/index.ts'))};
    if (name === '@cancjs/node') return ${JSON.stringify(resolve(__dirname, '../errors/classes.ts'))};
    return original.call(this, name, ...rest);
  };
  Module._extensions['.ts'] = (mod, filename) => {
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        esModuleInterop: true,
        downlevelIteration: true,
        useDefineForClassFields: false,
      }
    }).outputText, filename);
  };
`;

const probe = `
  const assert = require('node:assert/strict');
  const native = require('node:fs/promises');
  const { open } = require(${JSON.stringify(resolve(__dirname, 'index.ts'))});
  (async () => {
    const sample = await native.open('package.json', 'r');
    const proto = Object.getPrototypeOf(sample);
    const hasReadLines = typeof sample.readLines === 'function';
    const hasDispose = typeof Symbol.asyncDispose === 'symbol' && typeof sample[Symbol.asyncDispose] === 'function';
    const mode = process.argv[1];
    const removed = mode === 'broken' ? ['readFile', ...(hasReadLines ? ['readLines'] : [])] : [];
    const descriptors = removed.map(name => [name, Object.getOwnPropertyDescriptor(proto, name)]);
    await sample.close();
    try {
      for (const name of removed) assert.ok(delete proto[name]);
      for (let i = 0; i < 2; i++) {
        const handle = await open('package.json', 'r');
        try {
          assert.ok((await handle.stat()).size > 0);
          assert.equal(typeof handle.readLines === 'function', hasReadLines && !removed.includes('readLines'));
          assert.equal(typeof Symbol.asyncDispose === 'symbol' && typeof handle[Symbol.asyncDispose] === 'function', hasDispose);
        } finally {
          await handle.close();
        }
      }
      console.log(JSON.stringify({ version: process.version, hasReadLines, hasDispose }));
    } finally {
      for (const [name, descriptor] of descriptors) if (descriptor) Object.defineProperty(proto, name, descriptor);
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
`;

function runtimePath(prefix: string, packageName: string): string {
  return join(prefix, 'node_modules', packageName, 'bin', process.platform === 'win32' ? 'node.exe' : 'node');
}

function withNode180(run: (node: string) => void): void {
  const packageName = `node-${process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`;
  const cached = runtimePath(join(tmpdir(), 'canc', 'p116e-node180'), packageName);
  if (process.version === 'v18.0.0') {
    run(process.execPath);
  } else if (process.env.CANC_NODE180 || existsSync(cached)) {
    run(process.env.CANC_NODE180 ?? cached);
  } else {
    // Provision the exact host in an isolated prefix; no workspace install is changed.
    const base = join(tmpdir(), 'canc');
    mkdirSync(base, { recursive: true });
    const prefix = mkdtempSync(join(base, 'file-handle-host-'));
    try {
      const npm = process.env.npm_execpath;
      if (!npm) throw new Error('The exact Node 18.0.0 probe requires CANC_NODE180 or the npm test entry point');
      const result = spawnSync(
        process.execPath,
        [
          npm,
          'install',
          '--prefix',
          prefix,
          '--no-save',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          `${packageName}@18.0.0`,
        ],
        { encoding: 'utf8', timeout: 20000 },
      );
      expect(result.error).toBeUndefined();
      if (result.status !== 0) throw new Error(`Node fixture install failed: ${result.stdout}\n${result.stderr}`);
      run(runtimePath(prefix, packageName));
    } finally {
      rmSync(prefix, { recursive: true, force: true });
    }
  }
}

function check(node: string, mode: string) {
  const child = spawnSync(node, ['-e', hook + probe, mode], { encoding: 'utf8', timeout: 10000 });
  expect(child.error).toBeUndefined();
  if (child.status !== 0) throw new Error(`Native probe failed: ${child.stdout}\n${child.stderr}`);
  const info = JSON.parse(child.stdout.trim()) as { version: string; hasReadLines: boolean; hasDispose: boolean };
  const warnings = child.stderr.split(/\r?\n/).filter((line) => line.includes('[canc] fs.FileHandle missing members'));
  return { info, warnings };
}

describe('native FileHandle member diagnostics', () => {
  it('does not warn on the actual oldest supported Node release', () => {
    withNode180((node) => {
      const { info, warnings } = check(node, 'normal');
      expect(info).toEqual({ version: 'v18.0.0', hasReadLines: false, hasDispose: false });
      expect(warnings).toEqual([]);
    });
  }, 40000);

  it('does not warn on a pristine current host', () => {
    const { info, warnings } = check(process.execPath, 'normal');
    expect(info.version).toBe(process.version);
    expect(warnings).toEqual([]);
  }, 15000);

  it('warns once when two handles share a damaged native prototype', () => {
    const { info, warnings } = check(process.execPath, 'broken');
    expect(info.version).toBe(process.version);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('readFile');
    if (info.hasReadLines) expect(warnings[0]).toContain('readLines');
  }, 15000);
});
