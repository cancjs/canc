import { execFileSync } from 'child_process';
import * as path from 'path';

import { createLazyPromise, isLazyPromise, LazyPromise, promisify } from './index';

/**
 * End-to-end smoke for the native lazy promise, mirroring `canc-toolbox`'s
 * `lazy-promise-smoke.spec.ts`: same scenarios, minus the cancel surface this flavor does not
 * carry, with an AbortSignal standing in wherever the cancelable twin would use `cancel()`.
 */
describe('lazy promise smoke (native)', () => {
  it('LazyPromise.try does nothing until awaited, then caches for a second consumer', async () => {
    const fetchSomething = jest.fn(() => 'payload');
    const request = LazyPromise.try(fetchSomething);

    expect(fetchSomething).not.toHaveBeenCalled();
    expect(request.started).toBe(false);

    const first = await request;
    const second = await request;

    expect(fetchSomething).toHaveBeenCalledTimes(1);
    expect(first).toBe('payload');
    expect(second).toBe('payload');
  });

  it('LazyPromise.all leaves both inputs cold until the aggregate is awaited', async () => {
    const a = jest.fn(() => 'a');
    const b = jest.fn(() => 'b');
    const aggregate = LazyPromise.all([LazyPromise.try(a), LazyPromise.try(b)]);

    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(aggregate.started).toBe(false);

    expect(await aggregate).toEqual(['a', 'b']);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('createLazyPromise(existingLazy) returns the same object and does not start it', () => {
    const work = jest.fn(() => 1);
    const original = LazyPromise.try(work);

    const same = createLazyPromise(original);

    expect(same).toBe(original);
    expect(isLazyPromise(same)).toBe(true);
    expect(work).not.toHaveBeenCalled();
  });

  it('has no cancel surface at all: absent, not an inert stub', () => {
    const request = LazyPromise.try(() => 1);
    expect('cancel' in request).toBe(false);
  });

  it('{ signal } stands in for cancel-before-start: a pre-aborted signal means the thunk never runs, and the await rejects with the abort reason', async () => {
    const controller = new AbortController();
    controller.abort();
    const thunk = jest.fn(() => 'never');

    const request = new LazyPromise<string>((resolve) => resolve(thunk()), { signal: controller.signal });

    expect(thunk).not.toHaveBeenCalled();

    const error: unknown = await request.catch((e: unknown) => e);

    expect(error).toBe(controller.signal.reason);
    expect(thunk).not.toHaveBeenCalled();
  });

  it('promisify(fn, { lazy: true }) defers the callback until the first subscription', async () => {
    const callback = jest.fn((cb: (err: unknown, value?: string) => void) => cb(null, 'cb-value'));
    const wrapped = promisify(callback, { lazy: true });

    const pending = wrapped();
    expect(callback).not.toHaveBeenCalled();

    await expect(pending).resolves.toBe('cb-value');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('is adopted by the native Promise like any other PromiseLike, unaffected by the move', async () => {
    const request = LazyPromise.try(() => 'ok');
    await expect(Promise.resolve(request)).resolves.toBe('ok');
  });
});

/**
 * execute() vs `void lazy.then()`, in a REAL node process. jest's runner swallows
 * unhandledRejection, so this has to run outside it. Native mirror of the same contract proven for
 * the cancelable flavor in `canc-toolbox/src/lazy-unhandled-rejection.spec.ts`.
 */
const lazySource = path.join(__dirname, '..', '..', '_toolbox', 'lazy', 'lazy-promise-native.ts');

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

const events = [];
process.on('unhandledRejection', function (reason) {
 events.push('plain');
});

function noop() {}
function rejecting() {
 return new LazyPromise(function (_resolve, reject) { reject(new Error('boom')); });
}

const mode = ${JSON.stringify(mode)};
if (mode === 'execute-then-consume') {
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

describe('lazy promise smoke (execute vs void-then, real node process, native)', () => {
  jest.setTimeout(60000);

  it('execute() then await: exactly one execution, no unhandledRejection on a rejecting thunk', () => {
    expect(runChild('execute-then-consume')).toEqual([]);
  });

  it('control: void lazy.then() on the same shape DOES produce an unhandledRejection', () => {
    expect(runChild('void-then-then-consume')).toEqual(['plain']);
  });
});
