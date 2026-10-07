import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';
import { spawn } from 'child_process';
import * as path from 'path';

import * as timersExports from './index';
import { scheduler, setImmediate, setInterval, setTimeout } from './index';

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
 * Decouples startup delay from execution timeout by writing a ready marker after module loading
 * finishes. Allows a generous budget for initial loading under parallel load, then bounds the
 * execution window so uncleared timers fail promptly.
 */
function runChild(program: string, timeoutMs: number): Promise<{ stdout: string; elapsedMs: number }> {
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
    let isReady = false;
    let settled = false;
    let executionTimer: ReturnType<typeof global.setTimeout> | undefined;

    const startupTimer = global.setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`child startup timed out after 30s; stderr: ${stderr}`));
    }, 30000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (!isReady && stdout.includes(READY_MARKER)) {
        isReady = true;
        global.clearTimeout(startupTimer);
        executionTimer = global.setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill();
          reject(new Error(`child execution timed out after ${timeoutMs}ms; stderr: ${stderr}`));
        }, timeoutMs);
      }
    });

    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (err) => {
      global.clearTimeout(startupTimer);
      if (executionTimer) global.clearTimeout(executionTimer);
      if (settled) return;
      settled = true;
      reject(err);
    });

    child.on('close', (code, signal) => {
      global.clearTimeout(startupTimer);
      if (executionTimer) global.clearTimeout(executionTimer);
      if (settled) return;
      settled = true;

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

describe('setTimeout canceled: the process is not held open (real subprocess)', () => {
  jest.setTimeout(45000);

  it('a 10s timer canceled at 10ms lets the process exit almost immediately, proving the timer was cleared', async () => {
    const program = `
const timers = require(${JSON.stringify(timersEntry)});
const p = timers.setTimeout(10000);
setImmediate(function () { p.cancel('stop'); });
p.then(
 function () { process.stdout.write('resolved'); },
 function (err) { process.stdout.write('rejected:' + (err && err.name)); }
);
`;

    const { stdout } = await runChild(program, 8000);

    expect(stdout).toBe('rejected:CancelError');
    // uncleared 10s timer would hold the loop open past the 8s execution window
  });
});

describe('ref: false does not hold the event loop open (real subprocess)', () => {
  jest.setTimeout(45000);

  it('a 10s timer started with ref: false lets the process exit immediately, never firing', async () => {
    const program = `
const timers = require(${JSON.stringify(timersEntry)});
timers.setTimeout(10000, undefined, { ref: false });
process.stdout.write('SCRIPT_END');
`;

    const { stdout } = await runChild(program, 8000);

    expect(stdout).toBe('SCRIPT_END');
  });

  it('control: the same 10s timer WITHOUT ref: false holds the process open for the full delay', async () => {
    const program = `
const timers = require(${JSON.stringify(timersEntry)});
timers.setTimeout(300);
process.stdout.write('SCRIPT_END');
`;

    const { stdout, elapsedMs } = await runChild(program, 8000);

    expect(stdout).toBe('SCRIPT_END');
    // no ref: false and nothing canceled it, so the process waits out the full 300ms timer
    expect(elapsedMs).toBeGreaterThanOrEqual(250);
  });
});

describe('setInterval canceled: the underlying timer is cleared (real subprocess)', () => {
  jest.setTimeout(45000);

  it('an interval canceled after one tick lets the process exit quickly rather than ticking indefinitely', async () => {
    const program = `
const timers = require(${JSON.stringify(timersEntry)});
async function main() {
 const it = timers.setInterval(20, 'tick');
 await it.next();
 it.cancel();
 process.stdout.write('DONE');
}
main();
`;

    const { stdout } = await runChild(program, 8000);

    expect(stdout).toBe('DONE');
  });
});
