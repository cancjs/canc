import { CancelablePromise } from './cancelable-promise';
import { CancelError } from './cancel-error';
import { isCancelError } from './helpers';

/**
 * Symbol.dispose / Symbol.asyncDispose.
 *
 * Guarded proto wiring (feature-detected; zero footprint when the symbols are absent):
 * - [Symbol.asyncDispose]() → internal no-throw cancel (bypasses strict), returns the
 * handler-settlement promise;
 * - [Symbol.dispose]() → fire-and-forget cancel;
 * - dispose after settle = silent no-op;
 * - shielded = no-op;
 * - disposing a strict promise does NOT throw;
 * - reason = CancelError with the dispose marker (disposed).
 */

const NativePromise = Promise;
const disposeSym = (Symbol as any).dispose as symbol | undefined;
const asyncDisposeSym = (Symbol as any).asyncDispose as symbol | undefined;

function macrotask(): Promise<void> {
	return new NativePromise(resolve => setTimeout(resolve, 10));
}

const describeSync = disposeSym ? describe : describe.skip;
const describeAsync = asyncDisposeSym ? describe : describe.skip;

describeSync('P1-11 Symbol.dispose (sync)', () => {
	it('is wired on the prototype when Symbol.dispose exists', () => {
		const promise = new CancelablePromise<number>(() => {/**/});
		expect(typeof (promise as any)[disposeSym!]).toBe('function');
		promise.cancel();
	});

	it('disposing a pending promise cancels it', async () => {
		let caught: any;
		const promise = new CancelablePromise<number>(() => {/**/});

		(promise as any)[disposeSym!]();

		expect(promise.isCanceled).toBe(true);
		await promise.catch(err => { caught = err; });
		expect(isCancelError(caught)).toBe(true);
	});

	it('dispose reason is a CancelError with the dispose marker', async () => {
		let caught: any;
		const promise = new CancelablePromise<number>(() => {/**/});
		(promise as any)[disposeSym!]();
		await promise.catch(err => { caught = err; });

		expect(isCancelError(caught)).toBe(true);
		expect((caught as CancelError).disposed).toBe(true);
	});

	it('dispose is fire-and-forget: returns undefined', () => {
		const promise = new CancelablePromise<number>(() => {/**/});
		const ret = (promise as any)[disposeSym!]();
		expect(ret).toBeUndefined();
	});

	it('dispose after settle is a silent no-op', async () => {
		const promise = new CancelablePromise<number>(resolve => resolve(5));
		await promise;

		expect(() => (promise as any)[disposeSym!]()).not.toThrow();
		expect(promise.isCanceled).toBe(false);
		await expect(promise).resolves.toBe(5);
	});

	it('disposing a strict promise does NOT throw', () => {
		const promise = new CancelablePromise<number>(() => {/**/}, { strict: true });
		expect(() => (promise as any)[disposeSym!]()).not.toThrow();
		expect(promise.isCanceled).toBe(true);
		promise.catch(() => {/**/});
	});

	it('disposing a shielded promise is a no-op', async () => {
		const promise = new CancelablePromise<number>(resolve => {
			setTimeout(() => resolve(9), 5);
		}, { shield: true });

		(promise as any)[disposeSym!]();

		expect(promise.isCanceled).toBe(false);
		await expect(promise).resolves.toBe(9);
	});
});

describeAsync('P1-11 Symbol.asyncDispose (async)', () => {
	it('is wired on the prototype when Symbol.asyncDispose exists', () => {
		const promise = new CancelablePromise<number>(() => {/**/});
		expect(typeof (promise as any)[asyncDisposeSym!]).toBe('function');
		promise.cancel();
	});

	it('asyncDispose cancels and returns a handler-settlement promise', async () => {
		const promise = new CancelablePromise<number>(() => {/**/});

		const result = (promise as any)[asyncDisposeSym!]();
		expect(result).toBeInstanceOf(CancelablePromise);

		const settled = await result;
		expect(Array.isArray(settled)).toBe(true); // empty allSettled with no handlers
		expect(promise.isCanceled).toBe(true);
	});

	it('asyncDispose awaits the settlement of cancel handlers', async () => {
		const order: string[] = [];
		const promise = new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
			handleCancel(() => new NativePromise<void>(r => setTimeout(() => { order.push('handler'); r(); }, 5)));
		});

		await (promise as any)[asyncDisposeSym!]();
		order.push('after-dispose');

		expect(order).toEqual(['handler', 'after-dispose']);
	});

	it('asyncDispose reason is a CancelError with the dispose marker', async () => {
		let caught: any;
		const promise = new CancelablePromise<number>(() => {/**/});
		await (promise as any)[asyncDisposeSym!]();
		await promise.catch(err => { caught = err; });

		expect(isCancelError(caught)).toBe(true);
		expect((caught as CancelError).disposed).toBe(true);
	});

	it('asyncDispose after settle is a silent no-op (still awaitable)', async () => {
		const promise = new CancelablePromise<number>(resolve => resolve(3));
		await promise;

		const result = (promise as any)[asyncDisposeSym!]();
		await result; // does not throw
		expect(promise.isCanceled).toBe(false);
		await expect(promise).resolves.toBe(3);
	});

	it('asyncDispose on a strict promise does NOT throw', async () => {
		const promise = new CancelablePromise<number>(() => {/**/}, { strict: true });
		await expect((promise as any)[asyncDisposeSym!]()).resolves.toBeDefined();
		expect(promise.isCanceled).toBe(true);
	});

	it('asyncDispose on a shielded promise is a no-op', async () => {
		const promise = new CancelablePromise<number>(resolve => {
			setTimeout(() => resolve(4), 5);
		}, { shield: true });

		await (promise as any)[asyncDisposeSym!]();

		expect(promise.isCanceled).toBe(false);
		await expect(promise).resolves.toBe(4);
	});
});

describe('_dispose routes through an overridden cancel', () => {
	it('invokes an own-property cancel override instead of duplicating reject logic', () => {
		const promise = new CancelablePromise<number>(() => {/**/});
		let overrideCalls = 0;
		let overrideDisposing: any;

		const original = promise.cancel.bind(promise);
		(promise as any).cancel = function (reason?: any, disposing?: boolean) {
			overrideCalls++;
			overrideDisposing = disposing;
			return original(reason, disposing);
		};

		(promise as any)._dispose();

		expect(overrideCalls).toBe(1);
		expect(overrideDisposing).toBe(true);
		expect(promise.isCanceled).toBe(true);
		promise.catch(() => {/**/});
	});

	it('override sees the disposal path even for a strict promise (no throw)', () => {
		const promise = new CancelablePromise<number>(() => {/**/}, { strict: true });
		let sawDisposing = false;

		const original = promise.cancel.bind(promise);
		(promise as any).cancel = function (reason?: any, disposing?: boolean) {
			sawDisposing = disposing === true;
			return original(reason, disposing);
		};

		expect(() => (promise as any)._dispose()).not.toThrow();
		expect(sawDisposing).toBe(true);
		expect(promise.isCanceled).toBe(true);
		promise.catch(() => {/**/});
	});
});

describe('await using integration (manual protocol fallback)', () => {
	// The tsconfig lib (es2022) does not include esnext.disposable, so `await using` syntax cannot
	// be type-checked here without changing the global lib floor (invariant). We exercise the exact
	// protocol `await using` would invoke: Symbol.asyncDispose on scope exit.
	it('protocol call mirrors await using scope-exit disposal', async () => {
		if (!asyncDisposeSym) {
			return;
		}

		let canceledAtExit = false;

		// Simulate: `{ await using op = task(); ... }` — dispose runs on block exit.
		const runScope = async () => {
			const op = new CancelablePromise<number>(() => {/**/});
			try {
				// ... use op ...
			} finally {
				await (op as any)[asyncDisposeSym]();
				canceledAtExit = op.isCanceled;
			}
		};

		await runScope();
		expect(canceledAtExit).toBe(true);
	});
});
