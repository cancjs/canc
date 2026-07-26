import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { promisify } from './index';

const kCustom = Symbol.for('nodejs.util.promisify.custom');

describe('promisify', () => {
	describe('basics (cancelable impl)', () => {
		it('resolves the value of an errfirst callback (happy path)', async () => {
			const fn = (a: number, cb: (err: any, value: number) => void) => cb(null, a * 2);
			const wrapped = promisify(fn);
			await expect(wrapped(21)).resolves.toBe(42);
		});

		it('multiArgs:true resolves the array of callback values', async () => {
			const fn = (cb: (err: any, a: number, b: number) => void) => cb(null, 1, 2);
			await expect(promisify(fn, { multiArgs: true })()).resolves.toEqual([1, 2]);
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
	});

	describe('handleCancel teardown hook', () => {
		it('fires once with (handle, args, getSignal, reason) on cancel; promise rejects a CancelError', async () => {
			const handle = { stop: jest.fn() };
			const fn = (a: number, cb: (err: any, value: number) => void) => {
				// A synchronous imperative handle, like a ClientRequest or ChildProcess would return —
				// the callback never fires, so only the cancel path can settle the promise.
				return handle;
			};

			const hook = jest.fn();
			const wrapped = promisify(fn, { handleCancel: hook });

			const promise = wrapped(7) as CancelablePromise<number>;
			await Promise.resolve();

			promise.cancel('stop it');

			// The returned promise always rejects a branded CancelError, regardless of what the
			// registered cancel handler receives.
			const reason = await promise.catch((e) => e);
			expect(isCancelError(reason)).toBe(true);
			expect(promise.isCanceled).toBe(true);

			expect(hook).toHaveBeenCalledTimes(1);
			const [seenHandle, seenArgs, seenGetSignal, seenReason] = hook.mock.calls[0];
			expect(seenHandle).toBe(handle);
			expect(seenArgs).toEqual([7]);
			expect(typeof seenGetSignal).toBe('function');
			// The registered cancel handler receives the ORIGINAL raw reason passed to cancel(), not
			// the branded CancelError the promise itself rejects with (core only brands at the
			// promise's own rejection, not at the handler callback).
			expect(seenReason).toBe('stop it');
		});
	});

	describe('transformArgs signal injection', () => {
		it('injects a signal that aborts on cancel (signal.reason is raw, not branded)', async () => {
			let injectedSignal: any;

			const fn = (a: number, opts: { signal?: any }, cb: (err: any, value: number) => void) => {
				injectedSignal = opts.signal;
				// Never calls back: only cancel settles the promise.
			};

			const wrapped = promisify(fn, {
				transformArgs: (args, getSignal) => [...args, { signal: getSignal() }],
			});

			const promise = wrapped(1) as CancelablePromise<number>;
			await Promise.resolve();

			expect(injectedSignal).toBeDefined();
			expect(injectedSignal.aborted).toBe(false);

			promise.cancel('bye');

			expect(injectedSignal.aborted).toBe(true);
			// Current code: the injected signal's reason is RAW (promisify's makeCancelSignal call
			// passes no normalizeReason), unlike cancelify which brands via toCancelError. Asserting
			// the actual behavior here, not changing it (see phase follow-up on promisify parity).
			expect(isCancelError(injectedSignal.reason)).toBe(false);

			const reason = await promise.catch((e) => e);
			expect(isCancelError(reason)).toBe(true);
		});
	});

	describe('short-circuit on cancel', () => {
		it('a late-firing callback after cancel is a no-op: no throw, no double-settle', async () => {
			let firedCallback: ((err: any, value?: number) => void) | undefined;

			const errfirstFn = (cb: (err: any, value?: number) => void) => {
				firedCallback = cb;
				// Simulate a slow async op: the real callback fires only after we've already canceled.
				setTimeout(() => cb(null, 42), 50);
			};

			const wrapped = promisify(errfirstFn);
			const promise = wrapped() as CancelablePromise<number>;

			promise.cancel();

			const reason = await promise.catch((e) => e);
			expect(isCancelError(reason)).toBe(true);
			expect(promise.isCanceled).toBe(true);

			// The late callback firing after cancel must not throw and must not flip the settlement.
			expect(() => firedCallback?.(null, 42)).not.toThrow();
		});
	});
});
