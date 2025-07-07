import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';
import { suppress, suppressAbort, interopTimeout, toAbortSignal, withSignal } from './abort-interop';

function abortReason(controller = new AbortController()): Error {
	controller.abort();
	return controller.signal.reason as Error;
}

describe('suppress / suppressAbort', () => {
	it('suppresses a bare AbortError under the abort category', async () => {
		const rejected = Promise.reject(abortReason());
		await expect(suppress(['abort'], rejected)).resolves.toBeUndefined();
	});

	it('suppresses a CancelError whose cause is an abort under the abort category', async () => {
		const cancel = new CancelError(undefined, { cause: abortReason() });
		expect(cancel.aborted).toBe(true);
		await expect(suppress(['abort'], Promise.reject(cancel))).resolves.toBeUndefined();
	});

	it('does NOT suppress an ordinary CancelError under the abort-only category', async () => {
		const cancel = new CancelError('user canceled');
		await expect(suppress(['abort'], Promise.reject(cancel))).rejects.toBe(cancel);
	});

	it('suppresses an ordinary CancelError under the cancel category', async () => {
		const cancel = new CancelError('user canceled');
		await expect(suppress(['cancel'], Promise.reject(cancel))).resolves.toBeUndefined();
	});

	it('suppresses both categories when both are requested', async () => {
		await expect(suppress(['abort', 'cancel'], Promise.reject(abortReason()))).resolves.toBeUndefined();
		await expect(suppress(['abort', 'cancel'], Promise.reject(new CancelError('x')))).resolves.toBeUndefined();
	});

	it('rethrows an unrelated error', async () => {
		const boom = new Error('boom');
		await expect(suppress(['abort', 'cancel'], Promise.reject(boom))).rejects.toBe(boom);
	});

	it('passes a fulfilled value through', async () => {
		await expect(suppress(['abort'], Promise.resolve(42))).resolves.toBe(42);
	});

	it('suppressAbort is the abort-only shorthand', async () => {
		await expect(suppressAbort(Promise.reject(abortReason()))).resolves.toBeUndefined();
		const cancel = new CancelError('user canceled');
		await expect(suppressAbort(Promise.reject(cancel))).rejects.toBe(cancel);
	});

	it('returns a cancelable promise by default', () => {
		const promise = suppress(['abort'], new Promise(() => {}));
		expect(promise).toBeInstanceOf(CancelablePromise);
		(promise as CancelablePromise<unknown>).cancel();
	});
});

describe('fetch-shaped integration: abort in -> CancelError out -> suppress filters', () => {
	it('external abort cancels a CancelablePromise into an abort-caused CancelError, then suppress swallows it', async () => {
		const controller = new AbortController();

		// A fetch-shaped operation: a CancelablePromise wired to an external AbortSignal (as canc-fetch
		// would produce). Aborting the controller cancels the promise; canc threads the abort as the
		// CancelError cause, so the rejection is an abort-caused CancelError.
		const operation = new CancelablePromise<string>((_resolve) => {
			// never settles on its own
		}, { signal: controller.signal });

		controller.abort();

		let caught: unknown;
		await operation.catch((error) => {
			caught = error;
		});
		expect(isCancelError(caught)).toBe(true);
		expect((caught as CancelError).aborted).toBe(true);

		// Downstream, suppress(['abort']) filters exactly this class of rejection.
		const controller2 = new AbortController();
		const operation2 = new CancelablePromise<string>(() => {}, { signal: controller2.signal });
		controller2.abort();
		await expect(suppress(['abort'], operation2)).resolves.toBeUndefined();
	});
});

describe('interopTimeout: AbortSignal.any composition of external signal + timeout', () => {
	it('external signal aborting first wins the race', async () => {
		const controller = new AbortController();
		const promise = interopTimeout(new Promise(() => {}), 10_000, controller.signal);
		controller.abort();
		await expect(promise).rejects.toBeDefined();
	});

	it('timeout wins when no external signal aborts', async () => {
		const promise = interopTimeout(new Promise(() => {}), 5);
		await expect(promise).rejects.toBeDefined();
	});

	it('adopts the underlying settlement when neither signal nor timeout fires', async () => {
		const controller = new AbortController();
		await expect(interopTimeout(Promise.resolve('ok'), 10_000, controller.signal)).resolves.toBe('ok');
	});

	it('cancels a cancelable underlying operation when the external signal aborts', async () => {
		const controller = new AbortController();
		let canceled = false;
		const underlying = new CancelablePromise<string>((_resolve, _reject, handleCancel) => {
			handleCancel(() => {
				canceled = true;
			});
		});
		const promise = interopTimeout(underlying, 10_000, controller.signal).catch(() => undefined);
		controller.abort();
		await promise;
		expect(canceled).toBe(true);
	});
});

describe('toAbortSignal: inverse interop (promise cancels -> signal fires)', () => {
	it('fires the signal when the source promise cancels', async () => {
		const source = new CancelablePromise<void>(() => {});
		const signal = toAbortSignal(source);
		expect(signal.aborted).toBe(false);
		source.cancel();
		await Promise.resolve();
		await Promise.resolve();
		expect(signal.aborted).toBe(true);
	});

	it('composes with AbortSignal.any', async () => {
		const source = new CancelablePromise<void>(() => {});
		const other = new AbortController();
		const anyOf = (AbortSignal as unknown as { any(signals: AbortSignal[]): AbortSignal }).any;
		const combined = anyOf([toAbortSignal(source), other.signal]);
		expect(combined.aborted).toBe(false);
		source.cancel();
		await Promise.resolve();
		await Promise.resolve();
		expect(combined.aborted).toBe(true);
	});

	it('never fires for a fulfilled promise', async () => {
		const signal = toAbortSignal(Promise.resolve('done'));
		await Promise.resolve();
		await Promise.resolve();
		expect(signal.aborted).toBe(false);
	});
});

describe('withSignal (p-signal-shaped)', () => {
	it('rejects with the abort reason when the signal aborts first', async () => {
		const controller = new AbortController();
		const promise = withSignal(controller.signal, new Promise(() => {}));
		controller.abort();
		await expect(promise).rejects.toBeDefined();
	});

	it('rejects immediately for an already-aborted signal', async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(withSignal(controller.signal, Promise.resolve('never'))).rejects.toBeDefined();
	});

	it('resolves the value when the promise wins', async () => {
		const controller = new AbortController();
		await expect(withSignal(controller.signal, Promise.resolve('v'))).resolves.toBe('v');
	});

	it('passes an undefined signal straight through (optional-cancellation signature)', async () => {
		await expect(withSignal(undefined, Promise.resolve('v'))).resolves.toBe('v');
	});

	it('accepts a function receiving the signal', async () => {
		const controller = new AbortController();
		let received: AbortSignal | undefined;
		const promise = withSignal(controller.signal, (signal) => {
			received = signal;
			return Promise.resolve('fn');
		});
		await expect(promise).resolves.toBe('fn');
		expect(received).toBe(controller.signal);
	});

	it('passes undefined to the function when no signal is given', async () => {
		let received: AbortSignal | undefined = {} as AbortSignal;
		await withSignal(undefined, (signal) => {
			received = signal;
			return 'v';
		});
		expect(received).toBeUndefined();
	});
});
