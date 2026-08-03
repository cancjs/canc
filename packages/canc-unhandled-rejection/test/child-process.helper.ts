// Spec support: the handler can only be observed for real in a fresh process, so the specs run
// snippets in a child node. The child gets a require hook that transpiles the TypeScript sources
// on the fly and resolves the two @cancjs package names to this repo's sources.
import { spawnSync } from 'child_process';
import * as path from 'path';

export const unhandledSrc = path.resolve(__dirname, '../src/index.ts');
export const registerSrc = path.resolve(__dirname, '../src/register.ts');
export const promiseSrc = path.resolve(__dirname, '../../canc-promise/src/index.ts');

const hook = `
const ts = require(${JSON.stringify(require.resolve('typescript'))});
const Module = require('module');
const fs = require('fs');

Module._extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      downlevelIteration: true,
      useDefineForClassFields: false
    },
    fileName: filename
  });
  module._compile(out.outputText, filename);
};

const _origRequire = Module.prototype.require;
Module.prototype.require = function(request) {
  if (request === '@cancjs/promise') {
    return _origRequire.call(this, ${JSON.stringify(promiseSrc)});
  }
  if (request === '@cancjs/unhandled-rejection') {
    return _origRequire.call(this, ${JSON.stringify(unhandledSrc)});
  }
  return _origRequire.call(this, request);
};
`;

export interface IChildResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function runChild(code: string, envOverrides: Record<string, string> = {}): IChildResult {
  const fullCode = `
    ${hook}
    ${code}
  `;

  const res = spawnSync(process.execPath, ['--unhandled-rejections=throw', '-e', fullCode], {
    cwd: __dirname,
    env: {
      ...process.env,
      ...envOverrides,
    },
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return {
    status: res.status ?? 1,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}
