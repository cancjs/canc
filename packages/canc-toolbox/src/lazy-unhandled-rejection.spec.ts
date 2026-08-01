import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * unhandledRejection behavior of the lazy promise, tested in a REAL node process.
 *
 * jest's runner installs its own process-level unhandledRejection handling that swallows the event
 * and never forwards it to late `process.on` listeners, so the OS-level behavior cannot be observed
 * from inside a jest test. These cases spawn a plain node child (with an on-the-fly TypeScript
 * transpile require-hook so current source is always under test) and assert which rejections
 * surface as unhandled.
 *
 * Contract under test:
 * - an unconsumed lazy rejection produces NO event, because the rejection is not created until
 *   someone subscribes (the eager promise is the control case and DOES produce one)
 * - `execute()` produces no event on a rejecting body, while `void lazy.then()` on the same body
 *   does, which is the whole reason the method exists
 */

const lazySource = path.join(__dirname, '..', '..', '_toolbox', 'lazy', 'lazy-promise.ts');

// Require-hook: transpile .ts on the fly with the TS compiler so the child runs current source.
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
`;

function runChild(mode: string): string[] {
  const program = `
${hook}
const { LazyPromise } = require(${JSON.stringify(lazySource)});
const { CancelablePromise } = require('@cancjs/promise');

const events = [];
process.on('unhandledRejection', function (reason) {
 events.push(reason && reason.name === 'CancelError' ? 'CancelError' : 'plain');
});

function noop() {}
function rejecting() {
 return new LazyPromise(function (_resolve, reject) { reject(new Error('boom')); });
}

const mode = ${JSON.stringify(mode)};
if (mode === 'lazy-reject-unconsumed') {
 LazyPromise.reject(new Error('boom'));
} else if (mode === 'eager-reject-unconsumed') {
 CancelablePromise.reject(new Error('boom'));
} else if (mode === 'with-resolvers-reject-unconsumed') {
 LazyPromise.withResolvers().reject(new Error('boom'));
} else if (mode === 'execute-then-consume') {
 var executed = rejecting();
 executed.execute();
 executed.then(noop, noop);
} else if (mode === 'void-then-then-consume') {
 var floated = rejecting();
 floated.then();
 floated.then(noop, noop);
}

setTimeout(function () { process.stdout.write('EVENTS:' + JSON.stringify(events)); }, 150);
`;

  const out = execFileSync(process.execPath, ['-e', program], {
    cwd: __dirname,
    encoding: 'utf8',
  });

  const marker = out.indexOf('EVENTS:');

  return JSON.parse(out.slice(marker + 'EVENTS:'.length)) as string[];
}

describe('LazyPromise unhandled rejection (real node process)', () => {
  jest.setTimeout(60000);

  it('produces no event for an unconsumed rejection', () => {
    expect(runChild('lazy-reject-unconsumed')).toEqual([]);
  });

  it('control: the eager equivalent does produce one', () => {
    expect(runChild('eager-reject-unconsumed')).toEqual(['plain']);
  });

  it('produces no event when a settler rejects an unconsumed lazy', () => {
    expect(runChild('with-resolvers-reject-unconsumed')).toEqual([]);
  });

  it('produces no event when the work is started with execute and consumed later', () => {
    expect(runChild('execute-then-consume')).toEqual([]);
  });

  it('control: starting the same work with a bare then does produce one', () => {
    expect(runChild('void-then-then-consume')).toEqual(['plain']);
  });
});
