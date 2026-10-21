import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * Unhandled combinator results, observed in a REAL node process: jest swallows the
 * process-level unhandledRejection event, so a listener inside a test never sees it (see
 * unhandled-rejection.spec.ts). One child runs every scenario in turn, each with the process
 * listeners swapped for its own recorder and restored afterwards.
 */

const srcDir = __dirname;

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

const scenarios = `
const CP = CancelablePromise;
const never = function () { return new CP(function () {}); };
const scenarios = {
 'race-rejected': function () { CP.race([CP.reject(new Error('race-err'))]); },
 'race-late': function () {
  CP.race([new CP(function (_resolve, reject) { setImmediate(function () { reject(new Error('race-late-err')); }); })]);
 },
 'race-late-with-pending': function () {
  CP.race([never(), new CP(function (_resolve, reject) { setImmediate(function () { reject(new Error('race-late-err')); }); })]);
 },
 'race-handled': function () { CP.race([CP.reject(new Error('race-err'))]).then(undefined, function () {}); },
 'race-canceled': function () { void CP.race([never()]).cancel(); },
 'all-rejected': function () { CP.all([CP.reject(new Error('all-err'))]); },
 'any-rejected': function () { CP.any([CP.reject(new Error('any-err'))]); },
 'allSettled-rejected': function () { CP.allSettled([CP.reject(new Error('settled-err'))]); },
};
`;

function runScenarios(): Record<string, string[]> {
  const entry = path.join(srcDir, 'cancelable-promise.ts');

  const program = `
${hook}
const { CancelablePromise } = require(${JSON.stringify(entry)});
${scenarios}
const results = {};
const names = Object.keys(scenarios);
function turn(callback) { setImmediate(function () { setImmediate(function () { setImmediate(callback); }); }); }
function next(index) {
 if (index === names.length) {
  process.stdout.write('EVENTS:' + JSON.stringify(results));
  return;
 }
 const name = names[index];
 const saved = process.listeners('unhandledRejection');
 process.removeAllListeners('unhandledRejection');
 const seen = (results[name] = []);
 process.on('unhandledRejection', function (reason) {
  seen.push(reason && reason.message);
 });
 scenarios[name]();
 turn(function () {
  process.removeAllListeners('unhandledRejection');
  saved.forEach(function (listener) { process.on('unhandledRejection', listener); });
  next(index + 1);
 });
}
next(0);
`;

  const out = execFileSync(process.execPath, ['-e', program], {
    cwd: srcDir,
    encoding: 'utf8',
  });

  const marker = out.indexOf('EVENTS:');
  return JSON.parse(out.slice(marker + 'EVENTS:'.length));
}

describe('combinator results report an unhandled rejection like native ones (real node process)', () => {
  jest.setTimeout(30000);

  let events: Record<string, string[]>;

  beforeAll(() => {
    events = runScenarios();
  });

  it('reports race over a rejected input once', () => {
    expect(events['race-rejected']).toEqual(['race-err']);
  });

  it('reports race over an input that rejects later once', () => {
    expect(events['race-late']).toEqual(['race-late-err']);
  });

  it('reports race over a late rejection next to a pending input once', () => {
    expect(events['race-late-with-pending']).toEqual(['race-late-err']);
  });

  it('reports nothing for a handled race', () => {
    expect(events['race-handled']).toEqual([]);
  });

  it('reports nothing for a canceled race', () => {
    expect(events['race-canceled']).toEqual([]);
  });

  it('reports all over a rejected input once', () => {
    expect(events['all-rejected']).toEqual(['all-err']);
  });

  it('reports any over rejected inputs once, as an aggregate', () => {
    expect(events['any-rejected']).toEqual(['All promises were rejected']);
  });

  it('reports nothing for allSettled over a rejected input', () => {
    expect(events['allSettled-rejected']).toEqual([]);
  });
});
