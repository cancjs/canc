import { CancelError, isCancelError } from '@cancjs/promise';

import { cancelableFetchFactory } from './base';


// Minimal AbortController/AbortSignal test doubles: enough surface for the factory (signal with
// aborted flag + abort()/onabort/addEventListener/dispatchEvent).
class MockAbortSignal {
	aborted = false;
	reason: any = undefined;
	onabort: ((this: any, event: any) => any) | null = null;
	private listeners: Array<(event: any) => void> = [];

	addEventListener(type: string, listener: (event: any) => void): void {
		if (type === 'abort') {
			this.listeners.push(listener);
		}
	}

	dispatchEvent(event: any): boolean {
		if (event?.type === 'abort') {
			this.aborted = true;
			if (typeof this.onabort === 'function') {
				this.onabort.call(this, event);
			}
			for (const listener of this.listeners.slice()) {
				listener(event);
			}
		}
		return true;
	}
}

class MockAbortController {
	signal = new MockAbortSignal();

	abort(reason?: any): void {
		if (this.signal.aborted) {
			return;
		}
		this.signal.reason = reason;
		this.signal.dispatchEvent(new MockEvent('abort'));
	}
}

class MockEvent {
	constructor(public type: string) {}
}

function makeAbortError(): Error {
	const error = new Error('The operation was aborted.');
	error.name = 'AbortError';
	return error;
}

// Deferred fetch: resolves/rejects only when the test tells it to, and rejects with an AbortError
// if its signal is aborted first (mirrors real fetch behavior).
function deferredFetch() {
	const calls: Array<{ input: any; init: any; signal: any }> = [];
	let settle: { resolve: (v: any) => void; reject: (e: any) => void } | null = null;

	const fetch = jest.fn((input: any, init?: any) => {
		calls.push({ input, init, signal: init?.signal });
		return new Promise((resolve, reject) => {
			settle = { resolve, reject };
			const signal = init?.signal;
			if (signal) {
				if (signal.aborted) {
					reject(makeAbortError());
					return;
				}
				signal.addEventListener('abort', () => reject(makeAbortError()));
			}
		});
	});

	return {
		fetch,
		calls,
		resolveWith: (value: any) => settle?.resolve(value),
		rejectWith: (error: any) => settle?.reject(error),
	};
}

function flush(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}

function makeFactory(overrides: Partial<{ fetch: any }> = {}) {
	const backing = deferredFetch();
	const cancelableFetch = cancelableFetchFactory({
		fetch: overrides.fetch ?? backing.fetch,
		AbortController: MockAbortController as any,
		Event: MockEvent as any,
	});
	return { cancelableFetch, ...backing };
}


describe('cancelableFetchFactory', () => {
	it('attaches a signal to the fetch init object', async () => {
		const { cancelableFetch, calls, resolveWith } = makeFactory();

		const promise = cancelableFetch('/api', { method: 'GET' });
		resolveWith('ok');
		await promise;

		expect(calls).toHaveLength(1);
		// Regression: signal must live on the merged init, not be dropped or passed as a third arg.
		expect(calls[0].init.signal).toBeInstanceOf(MockAbortSignal);
		expect(calls[0].init.method).toBe('GET');
	});

	it('aborts the controller when the promise is canceled', async () => {
		const { cancelableFetch, calls } = makeFactory();

		const promise = cancelableFetch('/api');
		await flush();
		expect(calls[0].signal.aborted).toBe(false);

		promise.cancel();

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(calls[0].signal.aborted).toBe(true);
		expect(isCancelError(error)).toBe(true);
	});

	it('maps an external abort to a CancelError carrying the abort error as cause', async () => {
		const external = new MockAbortController();
		const { cancelableFetch } = makeFactory();

		const promise = cancelableFetch('/api', { signal: external.signal });
		await flush();

		external.abort();

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(error).toBeInstanceOf(CancelError);
		expect(isCancelError(error)).toBe(true);
		expect(error.cause).toBeDefined();
		expect(error.cause.name).toBe('AbortError');
	});

	it('fires listeners on a user-provided signal when canceled internally', async () => {
		const external = new MockAbortController();
		const listener = jest.fn();
		external.signal.addEventListener('abort', listener);

		const { cancelableFetch } = makeFactory();
		const promise = cancelableFetch('/api', { signal: external.signal });
		await flush();

		promise.cancel();

		try {
			await promise;
		} catch {
			// expected CancelError
		}

		// Two-way interop: cancel propagates to the caller's own signal.
		expect(external.signal.aborted).toBe(true);
		expect(listener).toHaveBeenCalled();
	});

	it('aborts immediately for a pre-aborted input signal', async () => {
		const external = new MockAbortController();
		external.signal.aborted = true;

		const { cancelableFetch, calls } = makeFactory();
		const promise = cancelableFetch('/api', { signal: external.signal });

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(calls[0].signal.aborted).toBe(true);
		expect(isCancelError(error)).toBe(true);
	});

	it('reads a signal from a Request-object input', async () => {
		const external = new MockAbortController();
		const request = { url: '/api', signal: external.signal };

		const { cancelableFetch, calls } = makeFactory();
		const promise = cancelableFetch(request);
		await flush();

		external.abort();

		try {
			await promise;
		} catch {
			// expected CancelError
		}

		expect(calls[0].signal.aborted).toBe(true);
	});

	it('passes through non-abort rejections untouched', async () => {
		const { cancelableFetch, rejectWith } = makeFactory();
		const networkError = new Error('network down');

		const promise = cancelableFetch('/api');
		rejectWith(networkError);

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(error).toBe(networkError);
		expect(isCancelError(error)).toBe(false);
	});
});


describe('import safety', () => {
	it('imports the default entry without touching fetch globals', () => {
		// Loading the default (prebound) entry must not throw in an environment lacking fetch/
		// AbortController: globals are captured lazily on first call, not at module load.
		expect(() => {
			jest.isolateModules(() => {
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				const mod = require('./index');
				expect(typeof mod.default).toBe('function');
				expect(typeof mod.cancelableFetch).toBe('function');
				expect(typeof mod.cancelableFetchFactory).toBe('function');
			});
		}).not.toThrow();
	});
});
