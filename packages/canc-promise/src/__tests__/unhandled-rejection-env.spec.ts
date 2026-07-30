import { execFileSync, spawnSync } from 'child_process';
import * as path from 'path';

/**
 * unhandledRejection environment behavior (node flags + stderr assertions).
 *
 * Extends the base unhandledRejection suite to cover node CLI flag matrix:
 * - default (--unhandled-rejections=warn): unhandledRejection fires + stderr warn printed
 * - --unhandled-rejections=strict: process exits non-zero on unhandled rejection
 * - reject() + handle-later timing: handler added after microtask drain stops event
 *
 * Each test spawns a child node process (args matrix), asserts stderr pattern & exit code.
 */

const srcDir = path.dirname(__filename);
const monorepoRoot = path.join(srcDir, '../../../../..');

// Require-hook: transpile .ts on the fly with the TS compiler.
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

interface ChildRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runChildWithFlags(program: string, nodeFlags: string[] = []): ChildRunResult {
  const result = spawnSync(process.execPath, [...nodeFlags, '-e', program], {
    cwd: srcDir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function makeProgram(mode: string): string {
  const entry = path.join(srcDir, '..', 'cancelable-promise.ts');
  const errorEntry = path.join(srcDir, '..', 'cancel-error.ts');

  return `
${hook}
const { CancelablePromise } = require(${JSON.stringify(entry)});
const { CancelError } = require(${JSON.stringify(errorEntry)});

const mode = ${JSON.stringify(mode)};
const startTime = Date.now();

function log(msg) {
 process.stdout.write('LOG:' + msg + '\\n');
}

if (mode === 'plain-no-handler') {
 // Plain rejection, no handler → fires unhandledRejection
 new CancelablePromise(function (_resolve, reject) {
 reject(new Error('plain rejection'));
 });
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'cancelerror-no-handler') {
 // CancelError rejection, no handler → suppressed
 new CancelablePromise(function (_resolve, reject) {
 reject(new CancelError('cancel error'));
 });
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'cancel-call') {
 // cancel() call → suppressed
 var p = new CancelablePromise(function () {});
 p.cancel('explicit cancel');
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'plain-handle-later') {
 // Reject plain error, then add handler after microtask (late catch) → no unhandledRejection
 var p = new CancelablePromise(function (_resolve, reject) {
 reject(new Error('late-handled'));
 });
 // Handler added in next macrotask
 setTimeout(() => {
 p.catch(function () {
 log('caught-in-macrotask');
 });
 }, 0);
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'cancelerror-handle-later') {
 // CancelError rejection, handle later (should still be suppressed)
 var p = new CancelablePromise(function (_resolve, reject) {
 reject(new CancelError('late-cancel'));
 });
 setTimeout(() => {
 p.catch(function () {
 log('caught-cancel');
 });
 }, 0);
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'multiple-rejections') {
 // Multiple unhandled plain rejections
 new CancelablePromise(function (_resolve, reject) {
 reject(new Error('first'));
 });
 new CancelablePromise(function (_resolve, reject) {
 reject(new Error('second'));
 });
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'cancelerror-mixed') {
 // Mix: CancelError (suppressed) + plain rejection (fires)
 new CancelablePromise(function (_resolve, reject) {
 reject(new CancelError('should-suppress'));
 });
 new CancelablePromise(function (_resolve, reject) {
 reject(new Error('should-fire'));
 });
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'chain-cancelerror') {
 // Chain: reject CancelError on parent → child inherits suppression
 var parent = new CancelablePromise(function (_resolve, reject) {
 reject(new CancelError('parent-cancel'));
 });
 var child = parent.then(
 function () { return 'ok'; },
 function (err) { return CancelablePromise.reject(err); }
 );
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'async-plain-reject') {
 // Async rejection (setTimeout) of plain error → unhandledRejection fires
 new CancelablePromise(function (_resolve, reject) {
 setTimeout(function () {
 reject(new Error('async-plain'));
 }, 10);
 });
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'async-cancelerror-reject') {
 // Async rejection of CancelError → suppressed
 new CancelablePromise(function (_resolve, reject) {
 setTimeout(function () {
 reject(new CancelError('async-cancel'));
 }, 10);
 });
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'reject-null') {
 // Reject with null (not Error)
 new CancelablePromise(function (_resolve, reject) {
 reject(null);
 });
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'reject-string') {
 // Reject with string
 new CancelablePromise(function (_resolve, reject) {
 reject('plain string rejection');
 });
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'sync-handler-plain') {
 // Plain rejection + immediate sync catch in executor
 var p = new CancelablePromise(function (_resolve, reject) {
 reject(new Error('sync-catch'));
 });
 p.catch(function () {
 log('sync-caught');
 });
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'sync-handler-cancelerror') {
 // CancelError + sync catch → no event
 var p = new CancelablePromise(function (_resolve, reject) {
 reject(new CancelError('sync-catch-cancel'));
 });
 p.catch(function () {
 log('sync-caught-cancel');
 });
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'chain-plain-rejection') {
 // Resolve with value, then chain rejects plain → fires
 var p = new CancelablePromise(function (resolve) {
 resolve('ok');
 });
 var p2 = p.then(function () {
 return CancelablePromise.reject(new Error('chain-plain'));
 });
 setTimeout(() => {
 log('done-waiting');
 }, 200);

} else if (mode === 'chain-cancelerror-rejection') {
 // Chain rejection of CancelError → suppressed
 var p = new CancelablePromise(function (resolve) {
 resolve('ok');
 });
 var p2 = p.then(function () {
 return CancelablePromise.reject(new CancelError('chain-cancel'));
 });
 setTimeout(() => {
 log('done-waiting');
 }, 200);
}
`;
}

describe('unhandledRejection env behavior (node flags)', () => {
  jest.setTimeout(30000);

  describe('default mode (node 24+: throw behavior)', () => {
    it('plain rejection with no handler: exit non-zero, stderr shows Error', () => {
      const program = makeProgram('plain-no-handler');
      const result = runChildWithFlags(program);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/Error|plain rejection/i);
    });

    it('CancelError rejection: suppressed, exit 0, no error in stderr', () => {
      const program = makeProgram('cancelerror-no-handler');
      const result = runChildWithFlags(program);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('done-waiting');
      expect(result.stderr).not.toMatch(/Error/i);
    });

    it('cancel() call: suppressed, exit 0', () => {
      const program = makeProgram('cancel-call');
      const result = runChildWithFlags(program);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('done-waiting');
    });

    it('CancelError + late handler: suppressed even after async add, exit 0', () => {
      const program = makeProgram('cancelerror-handle-later');
      const result = runChildWithFlags(program);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('caught-cancel');
    });

    it('multiple plain rejections: first unhandled triggers, exit non-zero', () => {
      const program = makeProgram('multiple-rejections');
      const result = runChildWithFlags(program);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/Error|first/i);
    });

    it('CancelError + plain rejection mix: plain rejects, exit non-zero, cancel suppressed', () => {
      const program = makeProgram('cancelerror-mixed');
      const result = runChildWithFlags(program);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/Error|should-fire/i);
    });

    it('chain: parent CancelError rejection suppressed, exit 0', () => {
      const program = makeProgram('chain-cancelerror');
      const result = runChildWithFlags(program);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('done-waiting');
    });

    it('async plain rejection: exit non-zero', () => {
      const program = makeProgram('async-plain-reject');
      const result = runChildWithFlags(program);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/Error|async-plain/i);
    });

    it('async CancelError rejection: suppressed, exit 0', () => {
      const program = makeProgram('async-cancelerror-reject');
      const result = runChildWithFlags(program);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('done-waiting');
    });

    it('reject with null: fires unhandled (not CancelError), exit non-zero', () => {
      const program = makeProgram('reject-null');
      const result = runChildWithFlags(program);

      expect(result.exitCode).not.toBe(0);
    });

    it('reject with string: fires unhandled, exit non-zero', () => {
      const program = makeProgram('reject-string');
      const result = runChildWithFlags(program);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/plain string rejection/i);
    });

    it('sync catch on plain rejection: handled, exit 0', () => {
      const program = makeProgram('sync-handler-plain');
      const result = runChildWithFlags(program);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('sync-caught');
    });

    it('sync catch on CancelError: suppressed, exit 0', () => {
      const program = makeProgram('sync-handler-cancelerror');
      const result = runChildWithFlags(program);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('sync-caught-cancel');
    });

    it('chain: resolve then reject plain in then-block: exit non-zero', () => {
      const program = makeProgram('chain-plain-rejection');
      const result = runChildWithFlags(program);

      expect(result.exitCode).not.toBe(0);
    });

    it('chain: resolve then reject CancelError in then-block: suppressed, exit 0', () => {
      const program = makeProgram('chain-cancelerror-rejection');
      const result = runChildWithFlags(program);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('done-waiting');
    });
  });

  describe('warn mode (--unhandled-rejections=warn)', () => {
    it('plain rejection: warns, exit 0 (warn allows continue)', () => {
      const program = makeProgram('plain-no-handler');
      const result = runChildWithFlags(program, ['--unhandled-rejections=warn']);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch(/UnhandledPromiseRejectionWarning|plain rejection/i);
    });

    it('CancelError rejection: suppressed, exit 0', () => {
      const program = makeProgram('cancelerror-no-handler');
      const result = runChildWithFlags(program, ['--unhandled-rejections=warn']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('done-waiting');
    });

    it('multiple plain rejections: multiple warnings, exit 0', () => {
      const program = makeProgram('multiple-rejections');
      const result = runChildWithFlags(program, ['--unhandled-rejections=warn']);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch(/UnhandledPromiseRejectionWarning/i);
    });

    it('chain plain rejection: warns, exit 0', () => {
      const program = makeProgram('chain-plain-rejection');
      const result = runChildWithFlags(program, ['--unhandled-rejections=warn']);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch(/UnhandledPromiseRejectionWarning|chain-plain/i);
    });

    it('chain CancelError rejection: suppressed, exit 0', () => {
      const program = makeProgram('chain-cancelerror-rejection');
      const result = runChildWithFlags(program, ['--unhandled-rejections=warn']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('done-waiting');
    });
  });

  describe('strict mode (--unhandled-rejections=strict)', () => {
    it('plain rejection: exits non-zero immediately', () => {
      const program = makeProgram('plain-no-handler');
      const result = runChildWithFlags(program, ['--unhandled-rejections=strict']);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/Error|plain rejection/i);
    });

    it('CancelError rejection: still suppressed, exit 0', () => {
      const program = makeProgram('cancelerror-no-handler');
      const result = runChildWithFlags(program, ['--unhandled-rejections=strict']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('done-waiting');
    });

    it('multiple plain rejections: exits on first, non-zero', () => {
      const program = makeProgram('multiple-rejections');
      const result = runChildWithFlags(program, ['--unhandled-rejections=strict']);

      expect(result.exitCode).not.toBe(0);
    });

    it('chain plain rejection: exits non-zero', () => {
      const program = makeProgram('chain-plain-rejection');
      const result = runChildWithFlags(program, ['--unhandled-rejections=strict']);

      expect(result.exitCode).not.toBe(0);
    });

    it('chain CancelError rejection: still suppressed, exit 0', () => {
      const program = makeProgram('chain-cancelerror-rejection');
      const result = runChildWithFlags(program, ['--unhandled-rejections=strict']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('done-waiting');
    });

    it('reject-null: exits non-zero (not CancelError)', () => {
      const program = makeProgram('reject-null');
      const result = runChildWithFlags(program, ['--unhandled-rejections=strict']);

      expect(result.exitCode).not.toBe(0);
    });
  });
});
