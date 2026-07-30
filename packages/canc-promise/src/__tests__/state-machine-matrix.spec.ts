import { CancelError } from '../cancel-error';
import { CancelablePromise } from '../cancelable-promise';
import { isCancelError } from '../helpers';

/**
 * State machine matrix.
 *
 * construct -> {sync resolve, async resolve, sync reject, async reject, resolve(thenable),
 * resolve(canc promise), resolve(self-ish), cancel} x observers (then/catch/finally order,
 * value identity). isCanceled/isCancelable at every stage. forceCancelable true/false x
 * thenable resolution. Executor throw -> rejection. Double-settle no-ops. `new` w/o
 * executor-fn -> TypeError (match native).
 *
 * No src edits — regressions found here are reported via tracker Gap, not fixed inline.
 */

const NativePromise = Promise;

function macrotask(ms = 5): Promise<void> {
  return new NativePromise((resolve) => setTimeout(resolve, ms));
}

describe('state machine matrix', () => {
  describe('construct: sync resolve', () => {
    it('is PENDING/cancelable synchronously right after construction, then FULFILLED', async () => {
      const promise = new CancelablePromise<number>((resolve) => resolve(1));

      // Sync resolve() flips internal state synchronously (per src) before the executor
      // call even returns, so by the time `new` returns it is already non-cancelable.
      expect(promise.isCanceled).toBe(false);
      expect(promise.isCancelable).toBe(false);

      await expect(promise).resolves.toBe(1);
      expect(promise.isCanceled).toBe(false);
      expect(promise.isCancelable).toBe(false);
    });

    it('value identity preserved for objects', async () => {
      const value = { a: 1 };
      const promise = new CancelablePromise<typeof value>((resolve) => resolve(value));

      await expect(promise).resolves.toBe(value);
    });

    it('then/catch/finally order: onFulfilled then finally, catch skipped', async () => {
      const order: string[] = [];
      const promise = new CancelablePromise<number>((resolve) => resolve(42));

      promise.then((value) => {
        order.push(`then:${value}`);
      });
      promise.catch(() => {
        order.push('catch');
      });
      promise.finally(() => {
        order.push('finally');
      });

      await macrotask();

      expect(order).toEqual(['then:42', 'finally']);
    });
  });

  describe('construct: async resolve', () => {
    it('is PENDING/cancelable until the macrotask resolves it', async () => {
      const promise = new CancelablePromise<number>((resolve) => {
        setTimeout(() => resolve(7), 10);
      });

      expect(promise.isCanceled).toBe(false);
      expect(promise.isCancelable).toBe(true);

      await expect(promise).resolves.toBe(7);

      expect(promise.isCanceled).toBe(false);
      expect(promise.isCancelable).toBe(false);
    });

    it('then/finally observers fire once settled, in registration order', async () => {
      const order: string[] = [];
      const promise = new CancelablePromise<number>((resolve) => setTimeout(() => resolve(1), 10));

      promise.then((v) => order.push(`then1:${v}`));
      promise.then((v) => order.push(`then2:${v}`));
      promise.finally(() => order.push('finally'));

      await macrotask(20);

      expect(order).toEqual(['then1:1', 'then2:1', 'finally']);
    });
  });

  describe('construct: sync reject', () => {
    it('is REJECTED (not CANCELED) synchronously, catch runs, then skipped', async () => {
      const promise = new CancelablePromise<number>((_resolve, reject) => reject('boom'));
      promise.catch(() => {
        /* swallow for isCanceled assertions below */
      });

      expect(promise.isCanceled).toBe(false);
      expect(promise.isCancelable).toBe(false);

      const order: string[] = [];
      const p2 = new CancelablePromise<number>((_resolve, reject) => reject('boom2'));
      p2.then(() => order.push('then')).catch(() => {
        /* noop for unhandled */
      });
      p2.catch((reason) => order.push(`catch:${reason}`));
      p2.finally(() => order.push('finally')).catch(() => {
        /* finally rethrows; swallow for unhandled */
      });

      await macrotask();
      expect(order).toEqual(['catch:boom2', 'finally']);
    });
  });

  describe('construct: async reject', () => {
    it('stays PENDING/cancelable until rejected, then REJECTED not CANCELED', async () => {
      const promise = new CancelablePromise<number>((_resolve, reject) => {
        setTimeout(() => reject('later'), 10);
      });
      promise.catch(() => {
        /* swallow */
      });

      expect(promise.isCanceled).toBe(false);
      expect(promise.isCancelable).toBe(true);

      await expect(promise.catch((e) => e)).resolves.toBe('later');

      expect(promise.isCanceled).toBe(false);
      expect(promise.isCancelable).toBe(false);
    });
  });

  describe('construct: resolve(thenable)', () => {
    it('adopts a native-Promise thenable value (forceCancelable default true)', async () => {
      const inner = NativePromise.resolve('inner-value');
      const promise = new CancelablePromise<string>((resolve) => resolve(inner));

      // Per src: forceCancelable:true keeps state PENDING until the inner thenable settles.
      expect(promise.isCancelable).toBe(true);

      await expect(promise).resolves.toBe('inner-value');
      expect(promise.isCanceled).toBe(false);
    });

    it('adopts a plain {then} thenable object', async () => {
      const thenable = { then: (res: any) => res('duck-typed') };
      const promise = new CancelablePromise<string>((resolve) => resolve(thenable as any));

      await expect(promise).resolves.toBe('duck-typed');
    });

    it('rejects when the adopted thenable rejects', async () => {
      const inner = NativePromise.reject('inner-fail');
      const promise = new CancelablePromise<string>((resolve) => resolve(inner));
      promise.catch(() => {
        /* swallow */
      });

      await expect(promise.catch((e) => e)).resolves.toBe('inner-fail');
    });
  });

  describe('construct: resolve(canc promise)', () => {
    it('adopts state/value of an inner CancelablePromise', async () => {
      const inner = new CancelablePromise<number>((resolve) => setTimeout(() => resolve(99), 10));
      const outer = new CancelablePromise<number>((resolve) => resolve(inner));

      await expect(outer).resolves.toBe(99);
    });

    it('propagates rejection of an inner CancelablePromise', async () => {
      const inner = CancelablePromise.reject('inner-canc-fail');
      const outer = new CancelablePromise<number>((resolve) => resolve(inner as any));
      outer.catch(() => {
        /* swallow */
      });

      await expect(outer.catch((e) => e)).resolves.toBe('inner-canc-fail');
    });
  });

  describe('construct: resolve(self-ish)', () => {
    // Resolving with a thenable whose `then` calls back into resolving itself indefinitely would
    // be a genuine self-resolution cycle (native Promise TypeErrors on true self-resolution via
    // `resolve(promise)` where promise === itself only when done through the *same* resolve call
    // synchronously — here we approximate "self-ish" with a thenable that resolves to itself,
    // exercising the adoption chain without hanging the test).
    it('resolving with a thenable that resolves to a fixed value terminates (no infinite adoption)', async () => {
      let calls = 0;
      const thenable = {
        then(res: any) {
          calls++;
          res('terminal');
        },
      };
      const promise = new CancelablePromise<string>((resolve) => resolve(thenable as any));

      await expect(promise).resolves.toBe('terminal');
      expect(calls).toBe(1);
    });
  });

  describe('construct: cancel', () => {
    it('transitions PENDING -> CANCELED, rejects with CancelError', async () => {
      const promise = new CancelablePromise<number>(() => {
        /* never settles */
      });

      expect(promise.isCancelable).toBe(true);
      expect(promise.isCanceled).toBe(false);

      promise.cancel('user-canceled');

      expect(promise.isCanceled).toBe(true);
      expect(promise.isCancelable).toBe(false);

      await expect(promise).rejects.toBeInstanceOf(CancelError);
    });

    it('then/catch/finally observers all see the CancelError, finally runs', async () => {
      const order: string[] = [];
      const promise = new CancelablePromise<number>(() => {
        /**/
      });

      promise
        .then(() => order.push('then-fulfilled'))
        .catch(() => {
          /* noop for unhandled */
        });
      promise.catch((reason) => order.push(`catch:${isCancelError(reason)}`));
      promise
        .finally(() => order.push('finally'))
        .catch(() => {
          /* finally rethrows; swallow for unhandled */
        });

      promise.cancel('reason-x');
      await macrotask();

      expect(order).toEqual(['catch:true', 'finally']);
    });

    it('cancel reason is preserved as CancelError message for string reasons', async () => {
      const promise = new CancelablePromise<number>(() => {
        /**/
      });

      promise.cancel('specific-reason');

      await promise.catch((err) => {
        expect(err).toBeInstanceOf(CancelError);
        expect(err.message).toBe('specific-reason');
      });
    });
  });

  describe('isCanceled/isCancelable at every stage', () => {
    it('PENDING: cancelable true, canceled false', () => {
      const promise = new CancelablePromise<number>(() => {
        /**/
      });
      expect(promise.isCancelable).toBe(true);
      expect(promise.isCanceled).toBe(false);

      promise.cancel();
    });

    it('FULFILLED: cancelable false, canceled false', async () => {
      const promise = new CancelablePromise<number>((resolve) => resolve(1));
      await promise;
      expect(promise.isCancelable).toBe(false);
      expect(promise.isCanceled).toBe(false);
    });

    it('REJECTED: cancelable false, canceled false', async () => {
      const promise = new CancelablePromise<number>((_r, reject) => reject('e'));
      await promise.catch(() => {
        /* swallow */
      });
      expect(promise.isCancelable).toBe(false);
      expect(promise.isCanceled).toBe(false);
    });

    it('CANCELED: cancelable false, canceled true', async () => {
      const promise = new CancelablePromise<number>(() => {
        /**/
      });

      promise.cancel();
      await promise.catch(() => {
        /* swallow */
      });
      expect(promise.isCancelable).toBe(false);
      expect(promise.isCanceled).toBe(true);
    });

    it('FORCE_PENDING (forceCancelable:false + thenable adoption): cancelable false, canceled false', () => {
      const inner = NativePromise.resolve('v');
      const promise = new CancelablePromise<string>((resolve) => resolve(inner), { forceCancelable: false });

      // Per src: FORCE_PENDING is treated as non-cancelable immediately upon adoption.
      expect(promise.isCancelable).toBe(false);
      expect(promise.isCanceled).toBe(false);
    });
  });

  describe('forceCancelable true/false x thenable resolution', () => {
    it('forceCancelable:true (default) stays PENDING/cancelable until inner thenable settles', async () => {
      let releaseInner: (v: string) => void;
      const inner = new NativePromise<string>((res) => {
        releaseInner = res;
      });
      const promise = new CancelablePromise<string>((resolve) => resolve(inner), { forceCancelable: true });

      expect(promise.isCancelable).toBe(true);

      releaseInner!('done');
      await expect(promise).resolves.toBe('done');
      expect(promise.isCancelable).toBe(false);
    });

    it('forceCancelable:true allows cancel() before inner thenable settles', async () => {
      let released = false;
      const inner = new NativePromise<string>((res) =>
        setTimeout(() => {
          released = true;
          res('late');
        }, 10),
      );
      const promise = new CancelablePromise<string>((resolve) => resolve(inner), { forceCancelable: true });

      expect(promise.isCancelable).toBe(true);

      promise.cancel('early');

      expect(promise.isCanceled).toBe(true);
      await expect(promise).rejects.toBeInstanceOf(CancelError);
      await macrotask(15);
      expect(released).toBe(true); // inner thenable itself still ran to completion
    });

    it('forceCancelable:false immediately goes FORCE_PENDING (non-cancelable) on thenable adoption', () => {
      const inner = NativePromise.resolve('v');
      const promise = new CancelablePromise<string>((resolve) => resolve(inner), { forceCancelable: false });

      expect(promise.isCancelable).toBe(false);
    });

    it('forceCancelable:false cancel() is a silent no-op once FORCE_PENDING', async () => {
      const inner = NativePromise.resolve('v2');
      const promise = new CancelablePromise<string>((resolve) => resolve(inner), { forceCancelable: false });

      expect(() => promise.cancel('nope')).not.toThrow();
      expect(promise.isCanceled).toBe(false);

      await expect(promise).resolves.toBe('v2');
    });

    it('forceCancelable:false + strict: cancel() on FORCE_PENDING throws', () => {
      const inner = NativePromise.resolve('v3');
      const promise = new CancelablePromise<string>((resolve) => resolve(inner), {
        forceCancelable: false,
        strict: true,
      });

      expect(() => promise.cancel('nope')).toThrow();
      promise.catch(() => {
        /* swallow just in case */
      });
    });
  });

  describe('executor throw -> rejection', () => {
    it('a synchronous throw in the executor rejects the promise with the thrown value', async () => {
      const promise = new CancelablePromise<number>(() => {
        throw new Error('executor-blew-up');
      });
      promise.catch(() => {
        /* swallow for isCanceled checks */
      });

      await expect(promise).rejects.toThrow('executor-blew-up');
      expect(promise.isCanceled).toBe(false);
    });

    it('executor throw of a non-Error value rejects with that value', async () => {
      const promise = new CancelablePromise<number>(() => {
        throw 'string-throw';
      });

      await expect(promise.catch((e) => e)).resolves.toBe('string-throw');
    });
  });

  describe('double-settle no-ops', () => {
    it('calling resolve() twice keeps the first value', async () => {
      const promise = new CancelablePromise<number>((resolve) => {
        resolve(1);
        resolve(2);
      });

      await expect(promise).resolves.toBe(1);
    });

    it('calling reject() after resolve() is a no-op', async () => {
      const promise = new CancelablePromise<number>((resolve, reject) => {
        resolve(1);
        reject('ignored');
      });

      await expect(promise).resolves.toBe(1);
    });

    it('calling resolve() after reject() is a no-op', async () => {
      const promise = new CancelablePromise<number>((resolve, reject) => {
        reject('first-error');
        resolve(1);
      });
      promise.catch(() => {
        /* swallow */
      });

      await expect(promise.catch((e) => e)).resolves.toBe('first-error');
    });

    it('calling cancel() twice: second call is a silent no-op (non-strict)', async () => {
      const promise = new CancelablePromise<number>(() => {
        /**/
      });

      promise.cancel('first');
      expect(() => promise.cancel('second')).not.toThrow();

      await promise.catch((err) => {
        expect(err.message).toBe('first');
      });
    });

    it('calling cancel() twice under strict: second call throws', () => {
      const promise = new CancelablePromise<number>(
        () => {
          /**/
        },
        { strict: true },
      );

      promise.cancel('first');

      expect(() => promise.cancel('second')).toThrow();
      promise.catch(() => {
        /* swallow */
      });
    });

    it('cancel() after resolve() is a silent no-op (non-strict)', async () => {
      const promise = new CancelablePromise<number>((resolve) => resolve(5));

      expect(() => promise.cancel('too-late')).not.toThrow();
      expect(promise.isCanceled).toBe(false);

      await expect(promise).resolves.toBe(5);
    });

    it('cancel() after resolve() under strict throws, value unaffected', async () => {
      const promise = new CancelablePromise<number>((resolve) => resolve(6), { strict: true });

      expect(() => promise.cancel('too-late')).toThrow();
      await expect(promise).resolves.toBe(6);
    });
  });

  describe('new without executor function (GAP vs native — see note)', () => {
    // GAP, not fixed here: native `new Promise(nonFunction)` throws SYNCHRONOUSLY from the
    // engine's own "resolver is not callable" check, which runs BEFORE the executor is ever
    // invoked, confirmed below. CancelablePromise's constructor has no equivalent upfront check:
    // it unconditionally calls `executor(resolve, reject, { handleCancel })` inside the wrapper
    // handed to `Reflect.construct(NativePromise, [wrapper], This)`. That call throws "executor
    // is not a function", but because it happens INSIDE the wrapper that native Promise's own
    // internals invoke (and native Promise's spec'd behavior is to catch an executor throw and
    // turn it into a REJECTION of the promise under construction, not a rethrow), the TypeError
    // never surfaces as a synchronous throw from `new CancelablePromise(...)`. Verified directly:
    // a try/catch wrapped tightly around the `new` call does NOT catch anything (see
    // child-process probe below), the rejection settles asynchronously on a promise that was
    // never returned to any caller (construction blew up before `Reflect.construct` could hand
    // back `instance`), so it is an ORPHANED, permanently unhandled rejection that crashes the
    // process under Node's default `--unhandled-rejections=throw`. This does not match native
    // `new Promise(nonFunction)` behavior (synchronous TypeError).
    //
    // Run out-of-process (spawnSync) since the crash is fatal to the whole worker if triggered
    // in-process, this keeps the assertion deterministic without taking down the test runner.
    it('GAP: does NOT synchronously TypeError like native — crashes as an orphaned unhandled rejection instead', () => {
      // Precompile the (small) dependency set to plain CJS with the TS compiler API, write to a
      // scratch temp dir, then run in a REAL child process — the crash under test is fatal to
      // whatever process it happens in, so it must not run in this jest worker.
      const ts = require('typescript');
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const { spawnSync } = require('child_process');

      const srcRoot = path.resolve(__dirname, '..', '..'); // packages/canc-promise
      const utilRoot = path.resolve(srcRoot, '..', '_util');

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canc-gap-probe-'));

      function compile(absSrc: string, outName: string) {
        const source = fs.readFileSync(absSrc, 'utf8');
        const { outputText } = ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2018,
            esModuleInterop: true,
          },
          fileName: absSrc,
        });
        // Flatten every relative import to a same-directory require (all files land flat in
        // tmpDir): '../../_util' -> './_util', './cancel-error' -> './cancel-error', etc.
        const rewritten = outputText.replace(
          /require\((['"])(\.[^'"]*)\1\)/g,
          (_m: string, q: string, spec: string) => {
            const base = spec.split('/').pop();
            return `require(${q}./${base}${q})`;
          },
        );
        fs.writeFileSync(path.join(tmpDir, outName), rewritten);
      }

      compile(path.join(srcRoot, 'src', 'cancel-error.ts'), 'cancel-error.js');
      compile(path.join(srcRoot, 'src', 'helpers.ts'), 'helpers.js');
      compile(path.join(srcRoot, 'src', 'cancelable-promise.ts'), 'cancelable-promise.js');
      compile(path.join(utilRoot, 'index.ts'), '_util.js');

      const probe = `
				const { CancelablePromise } = require(${JSON.stringify(path.join(tmpDir, 'cancelable-promise.js'))});
				let threw = false;
				try {
					new CancelablePromise();
				} catch (e) {
					threw = true;
				}
				process.stdout.write('threw=' + threw);
				setTimeout(() => { process.stdout.write(';reached-end'); }, 20);
			`;

      let result: { stdout: string; status: number | null };
      try {
        result = spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8' });
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }

      // Confirmed real (not a test mistake): construction does not throw synchronously...
      expect(result.stdout).toContain('threw=false');
      // ...and the child process crashes (nonzero exit) before reaching the setTimeout callback,
      // because the orphaned rejection is fatal under Node's default unhandled-rejection mode.
      expect(result.stdout).not.toContain('reached-end');
      expect(result.status).not.toBe(0);
    });

    it('native Promise DOES throw synchronously for comparison (control case)', () => {
      expect(() => new (NativePromise as any)()).toThrow(TypeError);
    });
  });

  describe('then/catch/finally value identity across the matrix', () => {
    it('fulfilled value identity is preserved through a then chain', async () => {
      const value = { tag: 'identity-check' };
      const promise = new CancelablePromise<typeof value>((resolve) => resolve(value));

      const received = await promise.then((v) => v);
      expect(received).toBe(value);
    });

    it('finally does not alter the fulfilled value', async () => {
      const promise = new CancelablePromise<number>((resolve) => resolve(123));
      const received = await promise.finally(() => {
        /* no return used */
      });
      expect(received).toBe(123);
    });

    it('finally does not swallow the rejection reason', async () => {
      const promise = new CancelablePromise<number>((_r, reject) => reject('finally-reason'));
      const finallyRan: string[] = [];

      const result = promise
        .finally(() => {
          finallyRan.push('ran');
        })
        .catch((e) => e);

      await expect(result).resolves.toBe('finally-reason');
      expect(finallyRan).toEqual(['ran']);
    });

    it('CancelError reason identity is preserved through catch', async () => {
      const promise = new CancelablePromise<number>(() => {
        /**/
      });

      promise.cancel('id-check');

      const err = await promise.catch((e) => e);
      expect(err).toBeInstanceOf(CancelError);
      expect(isCancelError(err)).toBe(true);
    });
  });

  describe('derived-child inherits forceCancelable through thenable adoption', () => {
    // A then-derived child copies the parent's flags. When the parent is forceCancelable:false,
    // the child must go FORCE_PENDING (non-cancelable) while adopting a thenable returned by the
    // handler, and cancel() on it must be a no-op. Previously the internal-construction resolve
    // wrapper consulted a shared stand-in that always said forceCancelable:true, so the inherited
    // false was ignored: getter and behavior contradicted each other.

    it('parent {forceCancelable:false} -> handler returns thenable: child stays non-cancelable', async () => {
      let releaseInner: (v: string) => void = () => {};
      const inner = new NativePromise<string>((res) => {
        releaseInner = res;
      });

      const parent = new CancelablePromise<number>((resolve) => resolve(1), { forceCancelable: false });
      const child = parent.then(() => inner);

      // Flags copied by then(): getter reflects the inherited false.
      expect(child.forceCancelable).toBe(false);

      // Let the fulfillment reaction fire and adopt the still-pending inner thenable.
      await macrotask();

      // Getter and behavior AGREE: FORCE_PENDING => non-cancelable.
      expect(child.isCancelable).toBe(false);
      expect(child.isCanceled).toBe(false);

      releaseInner('inner-done');
      await expect(child).resolves.toBe('inner-done');
    });

    it('parent {forceCancelable:false} -> child adopting thenable: cancel() is a no-op', async () => {
      let releaseInner: (v: string) => void = () => {};
      const inner = new NativePromise<string>((res) => {
        releaseInner = res;
      });

      const parent = new CancelablePromise<number>((resolve) => resolve(1), { forceCancelable: false });
      const child = parent.then(() => inner);

      await macrotask();

      expect(() => child.cancel('nope')).not.toThrow();
      expect(child.isCanceled).toBe(false);

      releaseInner('survived');
      await expect(child).resolves.toBe('survived');
    });

    it('flags are assigned before the adoption reaction fires (microtask ordering)', async () => {
      // then() copies flags synchronously right after construction; the resolve wrapper runs on
      // a later microtask. So at adoption time the inherited bit is already present.
      let releaseInner: (v: string) => void = () => {};
      const inner = new NativePromise<string>((res) => {
        releaseInner = res;
      });

      const parent = new CancelablePromise<number>((resolve) => resolve(1), { forceCancelable: false });
      const child = parent.then(() => inner);

      // Synchronously after then() returns, before any reaction has run.
      expect(child.forceCancelable).toBe(false);

      releaseInner('v');
      await expect(child).resolves.toBe('v');
    });

    it('parent {forceCancelable:false} -> handler returns a sync value: child settles normally', async () => {
      const parent = new CancelablePromise<number>((resolve) => resolve(1), { forceCancelable: false });
      const child = parent.then((v) => v + 41);

      expect(child.forceCancelable).toBe(false);
      await expect(child).resolves.toBe(42);
      expect(child.isCanceled).toBe(false);
      expect(child.isCancelable).toBe(false);
    });

    it('catch-derived child inherits forceCancelable:false through thenable adoption', async () => {
      let releaseInner: (v: string) => void = () => {};
      const inner = new NativePromise<string>((res) => {
        releaseInner = res;
      });

      const parent = new CancelablePromise<number>((_r, reject) => reject('boom'), { forceCancelable: false });
      const child = parent.catch(() => inner);

      expect(child.forceCancelable).toBe(false);
      await macrotask();
      expect(child.isCancelable).toBe(false);

      releaseInner('recovered');
      await expect(child).resolves.toBe('recovered');
    });

    it('finally-derived child inherits forceCancelable:false through thenable adoption', async () => {
      let releaseInner: (v: void) => void = () => {};
      const inner = new NativePromise<void>((res) => {
        releaseInner = res;
      });

      const parent = new CancelablePromise<number>((resolve) => resolve(7), { forceCancelable: false });
      const child = parent.finally(() => inner);

      expect(child.forceCancelable).toBe(false);
      await macrotask();
      expect(child.isCancelable).toBe(false);

      releaseInner();
      await expect(child).resolves.toBe(7);
    });

    it('forceCancelable:true default (unchanged): child adopting thenable stays cancelable', async () => {
      let releaseInner: (v: string) => void = () => {};
      const inner = new NativePromise<string>((res) => {
        releaseInner = res;
      });

      const parent = new CancelablePromise<number>((resolve) => resolve(1)); // default forceCancelable:true
      const child = parent.then(() => inner);

      expect(child.forceCancelable).toBe(true);
      await macrotask();

      // Default: still cancelable while adopting.
      expect(child.isCancelable).toBe(true);

      child.cancel('early');
      expect(child.isCanceled).toBe(true);
      await expect(child).rejects.toBeInstanceOf(CancelError);

      releaseInner('late');
    });
  });
});
