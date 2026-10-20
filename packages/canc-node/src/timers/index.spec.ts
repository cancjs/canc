import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';
import { spawn } from 'child_process';
import * as path from 'path';

import * as timersExports from './index';
import { scheduler, setImmediate, setInterval, setTimeout } from './index';

// hang guard only: the subprocess specs settle on the child's close event, never on this budget
jest.setTimeout(60000);

describe('@cancjs/node/timers module exports', () => {
  it('exports exactly the full timers/promises mirror: setTimeout, setImmediate, setInterval, scheduler', () => {
    const expected = new Set(['setTimeout', 'setImmediate', 'setInterval', 'scheduler']);
    expect(new Set(Object.keys(timersExports))).toEqual(expected);
  });

  it('scheduler carries exactly wait and yield', () => {
    expect(new Set(Object.keys(scheduler))).toEqual(new Set(['wait', 'yield']));
  });
});

describe('setTimeout', () => {
  it('resolves with the supplied value after the delay', async () => {
    await expect(setTimeout(1, 'done')).resolves.toBe('done');
  });

  it('canceled mid-wait rejects CancelError, not AbortError', async () => {
    const p = setTimeout(10000);
    p.cancel('stop');

    let caught: unknown;
    try {
      await p;
    } catch (err) {
      caught = err;
    }

    expect(isCancelError(caught)).toBe(true);
    expect((caught as { name?: unknown } | undefined)?.name).not.toBe('AbortError');
  });

  it('adopts a caller-supplied signal: aborting it cancels the same as calling cancel()', async () => {
    const controller = new AbortController();
    const p = setTimeout(10000, undefined, { signal: controller.signal });
    controller.abort();

    await expect(p).rejects.toBeInstanceOf(CancelError);
  });
});

describe('setImmediate', () => {
  it('resolves with the supplied value', async () => {
    await expect(setImmediate('done')).resolves.toBe('done');
  });

  it('canceled rejects CancelError', async () => {
    const p = setImmediate();
    p.cancel();

    await expect(p).rejects.toBeInstanceOf(CancelError);
  });
});

describe('scheduler.wait', () => {
  it('resolves after the delay', async () => {
    await expect(scheduler.wait(1)).resolves.toBeUndefined();
  });

  it('canceled rejects CancelError', async () => {
    const p = scheduler.wait(10000);
    p.cancel();

    await expect(p).rejects.toBeInstanceOf(CancelError);
  });
});

describe('scheduler.yield', () => {
  it("takes no options, matching node's own zero-parameter signature (not wrapped with an options bag)", () => {
    expect(scheduler.yield.length).toBe(0);
  });

  it('resolves and the result is a plain promise, not a CancelablePromise', async () => {
    const result = scheduler.yield();
    expect(result).not.toBeInstanceOf(CancelablePromise);
    expect(typeof (result as { cancel?: unknown }).cancel).not.toBe('function');
    await expect(result).resolves.toBeUndefined();
  });
});

describe('setInterval', () => {
  it('is an async iterable that yields on the given interval', async () => {
    const iterator = setInterval(5, 'tick');
    const first = await iterator.next();
    const second = await iterator.next();

    expect(first).toEqual({ value: 'tick', done: false });
    expect(second).toEqual({ value: 'tick', done: false });

    iterator.cancel();
  });

  it('cancel() ends iteration cleanly (done: true), stops pulling, and does not throw', async () => {
    const iterator = setInterval(5, 'tick');
    await iterator.next();

    iterator.cancel();

    const after = await iterator.next();
    expect(after.done).toBe(true);

    // once done, further pulls keep returning done rather than resuming the timer
    const again = await iterator.next();
    expect(again.done).toBe(true);
  });

  it('cancel() while a next() is pending resolves it done without waiting out the interval', async () => {
    const iterator = setInterval(60_000, 'tick');
    const pending = iterator.next();

    const started = Date.now();
    iterator.cancel();

    expect(await pending).toEqual({ value: undefined, done: true });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('breaking a for-await loop ends the iteration the same way cancel() does', async () => {
    let count = 0;
    for await (const _tick of setInterval(5, 'tick')) {
      count++;
      if (count === 2) {
        break;
      }
    }
    expect(count).toBe(2);
  });
});

/**
 * "The process is not held open" and "ref: false" cannot be observed from inside jest: jest's own
 * process has other active handles, so a leaked timer here would not visibly hang the test run.
 * Both run in a real, otherwise-empty node child process.
 */

const timersEntry = path.join(__dirname, 'index.ts');

// @cancjs/promise is not built in this checkout (root `npm test` is source-only), so the child
// resolves it to source the same way the root jest config's moduleNameMapper does, rather than
// requiring a prior `npm run build`.
const promiseSrcEntry = path.join(__dirname, '..', '..', '..', 'canc-promise', 'src', 'index.ts');

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
 resolveJsonModule: true,
 downlevelIteration: true,
 useDefineForClassFields: false
 },
 fileName: filename
 });
 module._compile(out.outputText, filename);
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
 if (request === '@cancjs/promise') {
 return origResolve.call(this, ${JSON.stringify(promiseSrcEntry)}, ...rest);
 }
 return origResolve.call(this, request, ...rest);
};
`;

const READY_MARKER = '<<READY>>\n';
const ELAPSED_MARKER = '<<elapsed>>';

/**
 * Runs a program in a real subprocess and reports how long the child execution took.
 *
 * No wall-clock budget: the promise settles on the child's `close` or `error` event only. The child
 * writes a ready marker after module loading so its stdout can be split from the loader's, and the
 * program reports facts about its own event loop (such as the live `Timeout` count) instead of the
 * parent timing it out.
 */
function runChild(program: string): Promise<{ stdout: string; elapsedMs: number }> {
  return new Promise((resolve, reject) => {
    const timer = [
      `require(${JSON.stringify(timersEntry)});`,
      "process.stdout.write('<<READY>>\\n');",
      'const __start = Date.now();',
      `process.on('exit', function () { process.stdout.write('${ELAPSED_MARKER}' + (Date.now() - __start)); });`,
    ].join('\n');

    const fullScript = `${hook}\n${timer}\n${program}`;

    const child = spawn(process.execPath, ['-e', fullScript], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`child killed by signal: ${signal}; stderr: ${stderr}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`child exited with code ${code}; stderr: ${stderr}\nstdout: ${stdout}`));
        return;
      }

      const readyIdx = stdout.indexOf(READY_MARKER);
      const cleanStdout = readyIdx !== -1 ? stdout.slice(readyIdx + READY_MARKER.length) : stdout;

      const at = cleanStdout.lastIndexOf(ELAPSED_MARKER);
      if (at === -1) {
        reject(new Error(`child did not report its elapsed time: ${cleanStdout}`));
        return;
      }

      resolve({
        stdout: cleanStdout.slice(0, at),
        elapsedMs: Number(cleanStdout.slice(at + ELAPSED_MARKER.length)),
      });
    });
  });
}

// the child reports after its cancel or ref decision, read on the next setImmediate;
// only 'Timeout' entries count, since stdio pipe handles add their own entries to the active list
const ACTIVE_PROBE = `
function activeTimeouts() {
  return process.getActiveResourcesInfo().filter(function (name) { return name === 'Timeout'; }).length;
}
`;

describe('setTimeout canceled: the timer is cleared (real subprocess)', () => {
  it('a 10s timer canceled before it fires leaves no active Timeout behind', async () => {
    const program = `
const timers = require(${JSON.stringify(timersEntry)});
${ACTIVE_PROBE}
const p = timers.setTimeout(10000);
setImmediate(function () {
  p.cancel('stop');
  setImmediate(function () { process.stdout.write('\\nACTIVE:' + activeTimeouts()); });
});
p.then(
 function () { process.stdout.write('resolved'); },
 function (err) { process.stdout.write('rejected:' + (err && err.name)); }
);
`;

    const { stdout } = await runChild(program);

    expect(stdout).toBe('rejected:CancelError\nACTIVE:0');
  });
});

describe('ref: false does not hold the event loop open (real subprocess)', () => {
  it('a 10s timer started with ref: false is not listed as an active Timeout', async () => {
    const program = `
const timers = require(${JSON.stringify(timersEntry)});
${ACTIVE_PROBE}
timers.setTimeout(10000, undefined, { ref: false });
setImmediate(function () { process.stdout.write('ACTIVE:' + activeTimeouts()); });
`;

    const { stdout } = await runChild(program);

    expect(stdout).toBe('ACTIVE:0');
  });

  it('control: the same 10s timer WITHOUT ref: false is listed as one active Timeout and holds the process open', async () => {
    const program = `
const timers = require(${JSON.stringify(timersEntry)});
${ACTIVE_PROBE}
timers.setTimeout(300);
setImmediate(function () { process.stdout.write('ACTIVE:' + activeTimeouts()); });
`;

    const { stdout, elapsedMs } = await runChild(program);

    expect(stdout).toBe('ACTIVE:1');
    // nothing canceled it, so the process waits out the full 300ms timer
    expect(elapsedMs).toBeGreaterThanOrEqual(250);
  });
});

describe('setInterval canceled: the underlying timer is cleared (real subprocess)', () => {
  it('an interval canceled after one tick leaves no active Timeout behind', async () => {
    const program = `
const timers = require(${JSON.stringify(timersEntry)});
${ACTIVE_PROBE}
async function main() {
 const it = timers.setInterval(20, 'tick');
 await it.next();
 it.cancel();
 setImmediate(function () { process.stdout.write('ACTIVE:' + activeTimeouts()); });
}
main();
`;

    const { stdout } = await runChild(program);

    expect(stdout).toBe('ACTIVE:0');
  });
});
