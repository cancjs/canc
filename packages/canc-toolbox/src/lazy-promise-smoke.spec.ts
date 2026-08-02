import { CancelablePromise, CancelError } from '@cancjs/promise';
import { execFileSync } from 'child_process';
import * as path from 'path';

import { cancelify } from './cancelify';
import { createLazyPromise, isLazyPromise, LazyPromise } from './index';
import { promisify } from './prebound';

/**
 * End-to-end smoke for the toolbox lazy promise, distinct from the exhaustive unit coverage in
 * `lazy-promise.spec.ts`: this file exercises the small set of behaviors an integrator actually
 * touches (defer + cache, cold combinators, identity passthrough, cancel-before-start, execute()'s
 * unhandled-rejection win, and the option surviving a rewiring into other toolbox helpers), each as
 * one straight-line scenario rather than an exhaustive matrix.
 */
describe('lazy promise smoke', () => {
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

  it('cancel-before-start: the thunk never runs and the await rejects CancelError', async () => {
    const thunk = jest.fn(() => 'never');
    const request = LazyPromise.try(thunk);

    request.cancel('gone');

    expect(thunk).not.toHaveBeenCalled();
    await expect(Promise.resolve(request)).rejects.toBeInstanceOf(CancelError);
    expect(thunk).not.toHaveBeenCalled();
  });

  it('cancelify(fn, { lazy: true }) still resolves end to end after the rewiring', async () => {
    // cancelify does not route through the { lazy: true } deferred-start wrapper (it builds a
    // CancelablePromise directly), so the option is opaque to it here. The point of this case is
    // that passing it does not break anything post-move: the call still resolves normally.
    const wrapped = cancelify(() => Promise.resolve('done'), { lazy: true } as unknown as Record<string, never>);

    await expect(wrapped()).resolves.toBe('done');
  });

  it('promisify(fn, { lazy: true }) defers the callback until the first subscription', async () => {
    const callback = jest.fn((cb: (err: unknown, value?: string) => void) => cb(null, 'cb-value'));
    const wrapped = promisify(callback, { lazy: true });

    const pending = wrapped();
    expect(callback).not.toHaveBeenCalled();

    await expect(pending).resolves.toBe('cb-value');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('is adopted by CancelablePromise.resolve like any other PromiseLike, unaffected by the move', async () => {
    const request = LazyPromise.try(() => 'ok');
    await expect(CancelablePromise.resolve(request)).resolves.toBe('ok');
  });
});

/**
 * execute() vs `void lazy.then()`, in a REAL node process. jest's runner swallows
 * unhandledRejection, so this has to run outside it (see `lazy-unhandled-rejection.spec.ts` for the
 * exhaustive version of this same contract; this is the smoke-level confirmation that the behavior
 * still holds after the phase's file moves and rewiring).
 */
const lazySource = path.join(__dirname, '..', '..', '_toolbox', 'lazy', 'lazy-promise.ts');

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
 events.push(reason && reason.name === 'CancelError' ? 'CancelError' : 'plain');
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

describe('lazy promise smoke (execute vs void-then, real node process)', () => {
  jest.setTimeout(60000);

  it('execute() then await: exactly one execution, no unhandledRejection on a rejecting thunk', () => {
    expect(runChild('execute-then-consume')).toEqual([]);
  });

  it('control: void lazy.then() on the same shape DOES produce an unhandledRejection', () => {
    expect(runChild('void-then-then-consume')).toEqual(['plain']);
  });
});
