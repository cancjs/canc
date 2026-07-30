import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * unhandledRejection behavior, tested in a REAL node process.
 *
 * jest's runner installs its own process-level unhandledRejection handling that swallows the
 * event and never forwards it to late `process.on` listeners, so the OS-level behavior cannot be
 * observed from inside a jest test. These cases spawn a plain node child (with an on-the-fly
 * TypeScript transpile require-hook so current source is always under test) and assert which
 * rejections surface as unhandled.
 *
 * Behavioral contract (inventory items 1, 3, 4):
 * - plain rejection with no handler -> unhandledRejection FIRES
 * - sync reject(CancelError) -> suppressed (no event)
 * - async reject(CancelError) -> suppressed (no event)
 * - cancel() -> suppressed (no event)
 */

const srcDir = __dirname;

// Require-hook: transpile .ts on the fly with the TS compiler so the child runs current source.
const hook = `
const ts = require(${JSON.stringify(require.resolve('typescript'))});
const Module = require('module');
const fs = require('fs');
const orig = Module._extensions['.js'];
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
`;

function runChild(mode: string): string[] {
  const entry = path.join(srcDir, 'cancelable-promise.ts');
  const errorEntry = path.join(srcDir, 'cancel-error.ts');

  const program = `
${hook}
const { CancelablePromise } = require(${JSON.stringify(entry)});
const { CancelError } = require(${JSON.stringify(errorEntry)});

const events = [];
process.on('unhandledRejection', function (reason) {
 events.push(reason && reason.name === 'CancelError' ? 'CancelError' : 'plain');
});

const mode = ${JSON.stringify(mode)};
if (mode === 'plain') {
 new CancelablePromise(function (_resolve, reject) { reject(new Error('plain')); });
} else if (mode === 'sync-cancelerror') {
 new CancelablePromise(function (_resolve, reject) { reject(new CancelError('sync')); });
} else if (mode === 'async-cancelerror') {
 new CancelablePromise(function (_resolve, reject) { setTimeout(function () { reject(new CancelError('async')); }, 0); });
} else if (mode === 'cancel') {
 var p = new CancelablePromise(function () {});
 p.cancel('canceled');
}

setTimeout(function () { process.stdout.write('EVENTS:' + JSON.stringify(events)); }, 150);
`;

  const out = execFileSync(process.execPath, ['-e', program], {
    cwd: srcDir,
    encoding: 'utf8',
  });

  const marker = out.indexOf('EVENTS:');
  return JSON.parse(out.slice(marker + 'EVENTS:'.length));
}

describe('unhandledRejection (real node process)', () => {
  jest.setTimeout(30000);

  it('item 1: plain rejection with no handler fires unhandledRejection', () => {
    expect(runChild('plain')).toEqual(['plain']);
  });

  it('item 3: sync reject(CancelError) is suppressed', () => {
    expect(runChild('sync-cancelerror')).toEqual([]);
  });

  it('item 4: async reject(CancelError) is suppressed', () => {
    expect(runChild('async-cancelerror')).toEqual([]);
  });

  it('item 2: cancel() is suppressed', () => {
    expect(runChild('cancel')).toEqual([]);
  });
});
