import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';
import { promisify, promisifyFactory, promisifyAll, promisifyAllFactory } from './promisify';

const kCustom = Symbol.for('nodejs.util.promisify.custom');

describe('promisify', () => {
	it('resolves the value of an errfirst callback', async () => {
		const fn = (a: number, cb: (err: any, value: number) => void) => cb(null, a * 2);
		const wrapped = promisify(fn);
		await expect(wrapped(21)).resolves.toBe(42);
	});

	it('rejects when the errfirst callback receives an error', async () => {
		const error = new Error('boom');
		const fn = (cb: (err: any) => void) => cb(error);
		await expect(promisify(fn)()).rejects.toBe(error);
	});

	it('honors errorFirst:false (value-first callback)', async () => {
		const fn = (cb: (value: number) => void) => cb(7);
		await expect(promisify(fn, { errorFirst: false })()).resolves.toBe(7);
	});

	it('multiArgs:true resolves the array of callback values', async () => {
		const fn = (cb: (err: any, a: number, b: number) => void) => cb(null, 1, 2);
		await expect(promisify(fn, { multiArgs: true })()).resolves.toEqual([1, 2]);
	});

	it('multiArgs:string[] resolves an object keyed by the given names', async () => {
		const fn = (cb: (err: any, stdout: string, stderr: string) => void) => cb(null, 'out', 'err');
		await expect(promisify(fn, { multiArgs: ['stdout', 'stderr'] })()).resolves.toEqual({ stdout: 'out', stderr: 'err' });
	});

	it('honors the promisify.custom symbol (cb path NOT used)', async () => {
		const cbPath = jest.fn();
		const fn: any = (cb: any) => {
			cbPath();
			cb(null, 'wrong');
		};
		fn[kCustom] = () => Promise.resolve('custom');

		await expect(promisify(fn)()).resolves.toBe('custom');
		expect(cbPath).not.toHaveBeenCalled();
	});

	it('ignores the custom symbol when custom:false', async () => {
		const fn: any = (cb: any) => cb(null, 'cb');
		fn[kCustom] = () => Promise.resolve('custom');

		await expect(promisify(fn, { custom: false })()).resolves.toBe('cb');
	});

	it('preserves this when the wrapped method is called on an object', async () => {
		const obj = {
			base: 10,
			add(this: any, n: number, cb: (err: any, value: number) => void) {
				cb(null, this.base + n);
			},
		};
		const add = promisify(obj.add);
		await expect(add.call(obj, 5)).resolves.toBe(15);
	});

	it('short-circuits on cancel and ignores a late callback (no double-settle)', async () => {
		let fire: (() => void) | undefined;
		const fn = (cb: (err: any, value: number) => void) => {
			fire = () => cb(null, 99);
		};
		const promise = promisify(fn)() as CancelablePromise<number>;

		promise.cancel('stop');
		const reason = await promise.catch((e) => e);
		expect(isCancelError(reason)).toBe(true);
		expect((reason as CancelError).message).toBe('stop');

		// The real callback fires late: must not throw, must not re-settle.
		expect(() => fire!()).not.toThrow();
	});

	it('invokes the imperative handleCancel hook with (handle, args, getSignal, reason)', async () => {
		const handle = { id: 'req' };
		const fn = (_a: string, _cb: (err: any) => void) => handle;
		const onCancel = jest.fn();

		const promise = promisify(fn, { handleCancel: onCancel })('x') as CancelablePromise<unknown>;
		promise.cancel('teardown');
		await promise.catch(() => {});

		expect(onCancel).toHaveBeenCalledTimes(1);
		const [gotHandle, gotArgs, getSignal, gotReason] = onCancel.mock.calls[0];
		expect(gotHandle).toBe(handle);
		expect(gotArgs).toEqual(['x']);
		expect(typeof getSignal).toBe('function');
		// The core hands cancel handlers the original reason, matching cancelable-promise semantics.
		expect(gotReason).toBe('teardown');
	});

	it('injects the outbound signal through transformArgs and aborts it on cancel', async () => {
		let captured: any;
		const fn = (_opts: any, _cb: (err: any) => void) => {
			// never call cb: keep the cancel window open
		};
		const promise = promisify(fn, {
			transformArgs: (args, getSignal) => {
				args[0] = { ...(args[0] || {}), signal: getSignal() };
				captured = args[0].signal;
				return args;
			},
		})({}) as CancelablePromise<unknown>;

		await Promise.resolve();
		expect(captured).toBeDefined();
		expect(captured.aborted).toBe(false);

		promise.cancel();
		await promise.catch(() => {});

		expect(captured.aborted).toBe(true);
		expect(isCancelError(captured.reason)).toBe(true);
	});

	it('runs transformArgs and handleCancel together', async () => {
		const handle = { sock: true };
		let signalSeen: any;
		const fn = (_opts: any, _cb: (err: any) => void) => handle;
		const onCancel = jest.fn();

		const promise = promisify(fn, {
			transformArgs: (args, getSignal) => {
				signalSeen = getSignal();
				args[0] = { ...(args[0] || {}), signal: signalSeen };
				return args;
			},
			handleCancel: onCancel,
		})({}) as CancelablePromise<unknown>;

		await Promise.resolve();
		promise.cancel();
		await promise.catch(() => {});

		expect(signalSeen).toBeDefined();
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onCancel.mock.calls[0][0]).toBe(handle);
	});

	it('lazy:true defers the underlying call until the first await', async () => {
		const fn = jest.fn((cb: (err: any, value: string) => void) => cb(null, 'late'));
		const wrapped = promisify(fn, { lazy: true });

		const promise = wrapped();
		expect(fn).not.toHaveBeenCalled();

		await expect(Promise.resolve(promise)).resolves.toBe('late');
		expect(fn).toHaveBeenCalledTimes(1);
	});
});

describe('promisifyAll', () => {
	function makeSource() {
		return {
			base: 3,
			readFile(this: any, name: string, cb: (err: any, value: string) => void) {
				cb(null, `${name}:${this.base}`);
			},
			readFileSync(name: string) {
				return name;
			},
			openStream() {
				return 'stream';
			},
		};
	}

	it('clone (default): new object with promisified methods only, Sync/Stream excluded', async () => {
		const source = makeSource();
		const out = promisifyAll(source);

		expect(out).not.toBe(source);
		expect(typeof out.readFile).toBe('function');
		expect((out as any).readFileSync).toBeUndefined();
		expect((out as any).openStream).toBeUndefined();

		await expect((out.readFile as any).call(source, 'f')).resolves.toBe('f:3');
	});

	it('merge: writes onto the source, keeps originals, requires a name change', async () => {
		const source = makeSource();
		const out = promisifyAll(source, { mode: 'merge', suffix: 'Async' });

		expect(out).toBe(source);
		expect(typeof (source as any).readFile).toBe('function');
		expect(typeof (source as any).readFileAsync).toBe('function');
		await expect((source as any).readFileAsync('g')).resolves.toBe('g:3');
	});

	it('overwrite: replaces the source methods in place with a name change', async () => {
		const source = makeSource();
		const out = promisifyAll(source, { mode: 'overwrite', transformName: (n) => n });

		expect(out).toBe(source);
		await expect((source as any).readFile('h')).resolves.toBe('h:3');
	});

	it('throws a clobber-guard error on merge/overwrite without a name change', () => {
		const source = makeSource();
		expect(() => promisifyAll(source, { mode: 'merge' })).toThrow();
		expect(() => promisifyAll(source, { mode: 'overwrite' })).toThrow();
	});

	it('caches the wrapped fn per source fn (same wrapped ref on repeat)', () => {
		const source = makeSource();
		const a = promisifyAll(source);
		const b = promisifyAll(source);
		expect(a.readFile).toBe(b.readFile);
	});

	it('honors include/exclude selection', () => {
		const source = makeSource();
		const out = promisifyAll(source, { include: ['readFile'] });
		expect(typeof out.readFile).toBe('function');
		expect((out as any).openStream).toBeUndefined();
	});
});

describe('native twin', () => {
	// Import lazily so the canc entry above is unaffected.
	const native = require('./native');

	it('promisify on native Promise resolves', async () => {
		const fn = (cb: (err: any, value: number) => void) => cb(null, 5);
		const promise = native.promisify(fn)();
		expect(promise).toBeInstanceOf(Promise);
		expect(promise).not.toBeInstanceOf(CancelablePromise);
		await expect(promise).resolves.toBe(5);
	});

	it('promisifyAll on native Promise resolves each method', async () => {
		const source = {
			read(name: string, cb: (err: any, value: string) => void) {
				cb(null, name);
			},
		};
		const out = native.promisifyAll(source);
		await expect(out.read('z')).resolves.toBe('z');
	});

	it('native promisify cancel is a detach no-op (never rejects a resolved promise)', async () => {
		// A native promise cannot be canceled; the wrapper resolves normally regardless.
		const fn = (cb: (err: any, value: string) => void) => setTimeout(() => cb(null, 'done'), 0);
		const promise = native.promisify(fn)();
		expect(typeof (promise as any).cancel).toBe('undefined');
		await expect(promise).resolves.toBe('done');
	});
});
