import { CancelablePromise, ICancelablePromiseFlagOptions } from '../cancelable-promise';
import { CancelError } from '../cancel-error';
import { createCancelSignal, isCancelError } from '../helpers';

/**
 * Options/signal.
 *
 * Covers: defaultOptions override + restore; per-option inheritance through then() (flags
 * inherit, signal does NOT, regression lock); strict throws matrix (cancel/handleCancel on
 * settled/canceled); asyncCancel sync vs async handler settle ordering; signal abort -> cancel
 * w/ signal.reason as cause; listener cleanup (black-box re-run); multiple promises one signal;
 * branded createCancelSignal migration (signals as the sole destructurable-cancel mechanism).
 */

const NativePromise = Promise;

function macrotask(): Promise<void> {
	return new NativePromise(resolve => setTimeout(resolve, 10));
}

describe('defaultOptions override + restore', () => {
	let original: Required<ICancelablePromiseFlagOptions>;

	beforeEach(() => {
		original = { ...CancelablePromise.defaultOptions };
	});

	afterEach(() => {
		CancelablePromise.defaultOptions = original;
	});

	it('overriding defaultOptions.bubble affects new instances without explicit options', () => {
		CancelablePromise.defaultOptions = { ...original, bubble: false };

		const promise = new CancelablePromise<number>(() => {/**/});
		expect(promise.bubble).toBe(false);
		promise.catch(() => {/**/});
	});

	it('overriding defaultOptions.strict affects new instances', () => {
		CancelablePromise.defaultOptions = { ...original, strict: true };

		const promise = new CancelablePromise<number>(() => {/**/});
		expect(promise.strict).toBe(true);
		promise.cancel();
	});

	it('explicit per-call option still overrides a changed default', () => {
		CancelablePromise.defaultOptions = { ...original, bubble: false };

		const promise = new CancelablePromise<number>(() => {/**/}, { bubble: true });
		expect(promise.bubble).toBe(true);
		promise.cancel();
	});

	it('restoring defaultOptions brings back original behavior', () => {
		CancelablePromise.defaultOptions = { ...original, asyncCancel: false };
		CancelablePromise.defaultOptions = original;

		const promise = new CancelablePromise<number>(() => {/**/});
		expect(promise.asyncCancel).toBe(original.asyncCancel);
		promise.cancel();
	});
});

describe('per-option inheritance through then() — flags inherit', () => {
	it('bubble inherits to then()-derived child', () => {
		const parent = new CancelablePromise<number>(resolve => resolve(1), { bubble: false });
		const child = parent.then(v => v);
		expect(child.bubble).toBe(false);
	});

	it('strict inherits to then()-derived child', () => {
		const parent = new CancelablePromise<number>(resolve => resolve(1), { strict: true });
		const child = parent.then(v => v);
		expect(child.strict).toBe(true);
	});

	it('asyncCancel inherits to then()-derived child', () => {
		const parent = new CancelablePromise<number>(resolve => resolve(1), { asyncCancel: false });
		const child = parent.then(v => v);
		expect(child.asyncCancel).toBe(false);
	});

	it('forceCancelable inherits to then()-derived child', () => {
		const parent = new CancelablePromise<number>(resolve => resolve(1), { forceCancelable: false });
		const child = parent.then(v => v);
		expect(child.forceCancelable).toBe(false);
	});

	it('shield does NOT inherit to then()-derived child (per-node)', () => {
		const parent = new CancelablePromise<number>(resolve => resolve(1), { shield: true });
		const child = parent.then(v => v);
		expect(parent.shield).toBe(true);
		expect(child.shield).toBe(false);
	});
});

describe('per-option inheritance through then() — signal does NOT inherit', () => {
	it('signal is NOT propagated to a then()-derived child: aborting it does not cancel the child', async () => {
		const controller = new AbortController();
		const parent = new CancelablePromise<number>(resolve => resolve(1), { signal: controller.signal });
		const child = parent.then(v => v);

		await macrotask();

		controller.abort(new Error('late'));

		await macrotask();

		expect(child.isCanceled).toBe(false);
		await expect(child).resolves.toBe(1);
	});

	it('CancelablePromise.resolve(sameInstance, {}) with no changed keys returns same instance', () => {
		const promise = new CancelablePromise<number>(() => {/**/});
		const resolved = CancelablePromise.resolve(promise, {
			asyncCancel: promise.asyncCancel,
			forceCancelable: promise.forceCancelable,
			bubble: promise.bubble,
			strict: promise.strict,
			shield: promise.shield,
		});

		expect(resolved).toBe(promise);
		promise.cancel();
	});

	it('CancelablePromise.resolve(sameInstance, {forceCancelable: !current}) returns a NEW instance', () => {
		const promise = new CancelablePromise<number>(() => {/**/}, { forceCancelable: true });
		const resolved = CancelablePromise.resolve(promise, { forceCancelable: false });

		expect(resolved).not.toBe(promise);
		expect(resolved.forceCancelable).toBe(false);
		promise.cancel();
		resolved.catch(() => {/**/});
	});
});

describe('strict throws matrix: cancel()/handleCancel() on settled/canceled', () => {
	it('strict: cancel() on an already-FULFILLED promise throws', async () => {
		const promise = new CancelablePromise<number>(resolve => resolve(1), { strict: true });
		await promise;

		expect(() => promise.cancel()).toThrow(/[Ss]ettled/);
	});

	it('strict: cancel() on an already-REJECTED (non-cancel) promise throws', async () => {
		const promise = new CancelablePromise<number>((_resolve, reject) => reject(new Error('boom')), { strict: true });
		await promise.catch(() => {/**/});

		expect(() => promise.cancel()).toThrow(/[Ss]ettled/);
	});

	it('strict: cancel() on an already-CANCELED promise throws', () => {
		const promise = new CancelablePromise<number>(() => {/**/}, { strict: true });
		promise.cancel();

		expect(() => promise.cancel()).toThrow(/[Cc]anceled/);
	});

	it('non-strict: cancel() on an already-settled promise is a silent no-op', async () => {
		const promise = new CancelablePromise<number>(resolve => resolve(1));
		await promise;

		expect(() => promise.cancel()).not.toThrow();
		expect(promise.isCanceled).toBe(false);
	});

	it('strict: handleCancel() on an already-FULFILLED promise throws', async () => {
		const promise = new CancelablePromise<number>(resolve => resolve(1), { strict: true });
		await promise;

		expect(() => promise.handleCancel(() => {/**/})).toThrow(/[Ss]ettled/);
	});

	it('strict: handleCancel() on an already-CANCELED promise throws', () => {
		const promise = new CancelablePromise<number>(() => {/**/}, { strict: true });
		promise.cancel();

		expect(() => promise.handleCancel(() => {/**/})).toThrow(/[Cc]anceled/);
	});

	it('non-strict: handleCancel() on an already-canceled promise is a silent no-op (no throw, no fire)', async () => {
		let fired = false;
		const promise = new CancelablePromise<number>(() => {/**/});
		promise.cancel();

		expect(() => promise.handleCancel(() => { fired = true; })).not.toThrow();

		await macrotask();
		expect(fired).toBe(false);
	});
});

describe('asyncCancel: sync vs async handler settle ordering', () => {
	it('asyncCancel:true — cancel() returns a promise that settles only after an async handler resolves', async () => {
		const order: string[] = [];

		const promise = new CancelablePromise<number>((_resolve, _reject, handleCancel) => {
			handleCancel(() => new NativePromise<void>(resolve => setTimeout(() => {
				order.push('async-handler');
				resolve();
			}, 15)));
		}, { asyncCancel: true });

		order.push('before-cancel');
		const settlement = promise.cancel() as CancelablePromise<PromiseSettledResult<unknown>[]>;
		order.push('after-cancel-call');

		await settlement;
		order.push('after-settlement');

		expect(order).toEqual(['before-cancel', 'after-cancel-call', 'async-handler', 'after-settlement']);
	});

	it('asyncCancel:true — multiple handlers (sync + async) all settle before the returned promise resolves', async () => {
		const order: string[] = [];

		const promise = new CancelablePromise<number>((_resolve, _reject, handleCancel) => {
			handleCancel(() => { order.push('sync-handler'); });
			handleCancel(() => new NativePromise<void>(resolve => setTimeout(() => {
				order.push('async-handler');
				resolve();
			}, 10)));
		}, { asyncCancel: true });

		const settlement = promise.cancel() as CancelablePromise<PromiseSettledResult<unknown>[]>;
		const results = await settlement;

		expect(order).toContain('sync-handler');
		expect(order).toContain('async-handler');
		expect(results).toHaveLength(2);
		expect(results.every(r => r.status === 'fulfilled')).toBe(true);
	});

	it('asyncCancel:false — handler runs synchronously, cancel() returns undefined immediately', () => {
		const order: string[] = [];

		const promise = new CancelablePromise<number>((_resolve, _reject, handleCancel) => {
			handleCancel(() => { order.push('sync-handler'); });
		}, { asyncCancel: false });

		const result = promise.cancel();
		order.push('after-cancel-call');

		expect(result).toBeUndefined();
		expect(order).toEqual(['sync-handler', 'after-cancel-call']);
	});

	it('asyncCancel:false — a throwing handler propagates synchronously from cancel()', () => {
		const promise = new CancelablePromise<number>((_resolve, _reject, handleCancel) => {
			handleCancel(() => { throw new Error('sync boom'); });
		}, { asyncCancel: false });

		expect(() => promise.cancel()).toThrow('sync boom');
	});

	it('asyncCancel:false — multiple handlers all fire even if the cleanup finally-guard is hit', () => {
		const seen: string[] = [];

		const promise = new CancelablePromise<number>((_resolve, _reject, handleCancel) => {
			handleCancel(() => { seen.push('a'); });
			handleCancel(() => { seen.push('b'); });
		}, { asyncCancel: false });

		promise.cancel();
		expect(seen).toEqual(['a', 'b']);
	});
});

describe('signal: abort -> cancel with signal.reason as cause', () => {
	it('abort with an Error reason -> promise rejects with CancelError whose cause is the reason', async () => {
		const controller = new AbortController();
		const reason = new Error('user aborted');
		const promise = new CancelablePromise<number>(() => {/**/}, { signal: controller.signal });

		controller.abort(reason);

		await macrotask();

		expect(promise.isCanceled).toBe(true);
		const error: any = await promise.catch(e => e);
		expect(isCancelError(error)).toBe(true);
		expect(error.cause).toBe(reason);
	});

	it('abort with a string reason -> CancelError message is the string, no cause (strings are messages, not causes)', async () => {
		const controller = new AbortController();
		const promise = new CancelablePromise<number>(() => {/**/}, { signal: controller.signal });

		controller.abort('stringy-reason');

		await macrotask();

		const error: any = await promise.catch(e => e);
		expect(isCancelError(error)).toBe(true);
		expect(error.message).toBe('stringy-reason');
		expect(error.cause).toBeUndefined();
	});

	it('abort fires registered handleCancel with the ORIGINAL signal.reason (handlers get raw reason, not the wrapped CancelError)', async () => {
		const controller = new AbortController();
		const reason = { detail: 'abort-reason' };
		let received: any;

		const promise = new CancelablePromise<number>((_resolve, _reject, handleCancel) => {
			handleCancel(r => { received = r; });
		}, { signal: controller.signal });

		controller.abort(reason);

		await macrotask();

		// Handler sees the raw reason passed to cancel()/_runCancellation, not the CancelError the
		// rejection itself was wrapped in.
		expect(received).toBe(reason);
		expect(isCancelError(received)).toBe(false);

		// The promise's own rejection IS the wrapped CancelError with that reason as cause.
		const rejection: any = await promise.catch(e => e);
		expect(isCancelError(rejection)).toBe(true);
		expect(rejection.cause).toBe(reason);
	});
});

describe('signal listener cleanup', () => {
	it('settling normally removes the abort listener from the signal', async () => {
		const controller = new AbortController();
		const signal = controller.signal;
		const spy = jest.spyOn(signal, 'removeEventListener');

		const promise = new CancelablePromise<string>(resolve => {
			setTimeout(() => resolve('done'), 5);
		}, { signal });

		await promise;
		await macrotask();

		expect(spy).toHaveBeenCalledWith('abort', expect.any(Function), expect.any(Object));
		spy.mockRestore();
	});

	it('canceling directly (not via signal) removes the abort listener too', async () => {
		const controller = new AbortController();
		const signal = controller.signal;
		const spy = jest.spyOn(signal, 'removeEventListener');

		const promise = new CancelablePromise<string>(() => {/**/}, { signal });
		promise.cancel();

		await macrotask();

		expect(spy).toHaveBeenCalledWith('abort', expect.any(Function), expect.any(Object));
		spy.mockRestore();
	});

	it('aborting after settle is a no-op: no state change, no throw', async () => {
		const controller = new AbortController();
		const promise = new CancelablePromise<string>(resolve => {
			setTimeout(() => resolve('ok'), 5);
		}, { signal: controller.signal });

		await promise;

		expect(() => controller.abort(new Error('too-late'))).not.toThrow();
		await macrotask();

		expect(promise.isCanceled).toBe(false);
		await expect(promise).resolves.toBe('ok');
	});
});

describe('multiple promises, one signal', () => {
	it('N independent promises sharing one signal all cancel on a single abort', async () => {
		const controller = new AbortController();
		const signal = controller.signal;

		const promises = Array.from({ length: 5 }, () => new CancelablePromise<number>(() => {/**/}, { signal }));

		controller.abort(new Error('shared-abort'));

		await macrotask();

		for (const p of promises) {
			expect(p.isCanceled).toBe(true);
		}
	});

	it('one promise settling early does not affect siblings sharing the same signal', async () => {
		const controller = new AbortController();
		const signal = controller.signal;

		const early = new CancelablePromise<number>(resolve => resolve(1), { signal });
		const late = new CancelablePromise<number>(() => {/**/}, { signal });

		await early;
		await macrotask();

		expect(early.isCanceled).toBe(false);
		expect(late.isCanceled).toBe(false);

		controller.abort();
		await macrotask();

		expect(late.isCanceled).toBe(true);
		// early already settled fulfilled — unaffected by the later abort.
		await expect(early).resolves.toBe(1);
	});

	it('shared signal: no listener growth across many promises after all settle', async () => {
		const controller = new AbortController();
		const signal = controller.signal;

		let addCount = 0;
		let removeCount = 0;
		const origAdd = signal.addEventListener.bind(signal);
		const origRemove = signal.removeEventListener.bind(signal);

		jest.spyOn(signal, 'addEventListener').mockImplementation(function (type: any, listener: any, opts: any) {
			if (type === 'abort') addCount++;
			return origAdd(type, listener, opts);
		});
		jest.spyOn(signal, 'removeEventListener').mockImplementation(function (type: any, listener: any, opts: any) {
			if (type === 'abort') removeCount++;
			return origRemove(type, listener, opts);
		});

		const promises = Array.from({ length: 8 }, (_, i) => new CancelablePromise<number>(resolve => {
			setTimeout(() => resolve(i), 0);
		}, { signal }));

		await Promise.all(promises);
		await macrotask();

		expect(addCount).toBe(8);
		expect(removeCount).toBe(8);
	});
});

describe('branded createCancelSignal migration (replaces cancel refs)', () => {
	it('destructurable cancel cancels the promise with a branded CancelError carrying the message', async () => {
		const { cancel, signal } = createCancelSignal();
		const promise = new CancelablePromise<number>(() => {/**/}, { signal });

		cancel('x');

		const error: any = await promise.catch(e => e);

		expect(isCancelError(error)).toBe(true);
		expect(error.message).toBe('x');
		expect(promise.isCanceled).toBe(true);
		// signal.aborted replaces the removed ref.canceled flag.
		expect(signal.aborted).toBe(true);
	});
});
