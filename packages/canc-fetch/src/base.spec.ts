import { CancelError, isCancelError, createCancelSignal } from '@cancjs/promise';

import { cancelableFetchFactory } from './base';


// Minimal AbortController/AbortSignal test doubles: enough surface for the factory (signal with
// aborted flag + abort()/onabort/addEventListener/dispatchEvent).
class MockAbortSignal {
	aborted = false;
	reason: any = undefined;
	onabort: ((this: any, event: any) => any) | null = null;
	listeners: Array<(event: any) => void> = [];

	addEventListener(type: string, listener: (event: any) => void): void {
		if (type === 'abort') {
			this.listeners.push(listener);
		}
	}

	removeEventListener(type: string, listener: (event: any) => void): void {
		if (type === 'abort') {
			const index = this.listeners.indexOf(listener);
			if (index !== -1) {
				this.listeners.splice(index, 1);
			}
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

// Native-like signal: `onabort` is a prototype accessor (so `'onabort' in signal` is always true,
// as on a real AbortSignal) backed by a private field, plus real add/removeEventListener. Lets the
// tests assert the factory takes the addEventListener path and never overwrites onabort.
class NativeLikeAbortSignal {
	aborted = false;
	reason: any = undefined;
	private _onabort: ((this: any, event: any) => any) | null = null;
	listeners: Array<(event: any) => void> = [];

	get onabort(): ((this: any, event: any) => any) | null {
		return this._onabort;
	}

	set onabort(value: ((this: any, event: any) => any) | null) {
		this._onabort = value;
	}

	addEventListener(type: string, listener: (event: any) => void): void {
		if (type === 'abort') {
			this.listeners.push(listener);
		}
	}

	removeEventListener(type: string, listener: (event: any) => void): void {
		if (type === 'abort') {
			const index = this.listeners.indexOf(listener);
			if (index !== -1) {
				this.listeners.splice(index, 1);
			}
		}
	}

	dispatchEvent(event: any): boolean {
		if (event?.type === 'abort') {
			this.aborted = true;
			if (typeof this._onabort === 'function') {
				this._onabort.call(this, event);
			}
			for (const listener of this.listeners.slice()) {
				listener(event);
			}
		}
		return true;
	}
}

// Ancient-polyfill signal: onabort assignment only, no addEventListener/removeEventListener.
class OnabortOnlyAbortSignal {
	aborted = false;
	onabort: ((this: any, event: any) => any) | null = null;

	fireAbort(event: any): void {
		this.aborted = true;
		if (typeof this.onabort === 'function') {
			this.onabort.call(this, event);
		}
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


describe('signal interop', () => {
	function makeNativeFactory(signal: any) {
		const backing = deferredFetch();
		const cancelableFetch = cancelableFetchFactory({
			fetch: backing.fetch,
			AbortController: MockAbortController as any,
		});
		const promise = cancelableFetch('/api', { signal });
		return { cancelableFetch, promise, ...backing };
	}

	it('wires a native signal via addEventListener without touching onabort', async () => {
		const external = new NativeLikeAbortSignal();
		const addSpy = jest.spyOn(external, 'addEventListener');
		const onabortSetSpy = jest.fn();
		const descriptor = Object.getOwnPropertyDescriptor(NativeLikeAbortSignal.prototype, 'onabort')!;
		Object.defineProperty(external, 'onabort', {
			configurable: true,
			get: descriptor.get,
			set(value) {
				onabortSetSpy(value);
				descriptor.set!.call(this, value);
			},
		});

		const { promise, resolveWith } = makeNativeFactory(external);
		await flush();

		expect(addSpy).toHaveBeenCalledWith('abort', expect.any(Function));
		expect(onabortSetSpy).not.toHaveBeenCalled();

		resolveWith('ok');
		await promise;
	});

	it('still cancels when the caller reassigns onabort after wiring', async () => {
		const external = new NativeLikeAbortSignal();
		const { promise, calls } = makeNativeFactory(external);
		await flush();

		// Caller overwrites onabort after the fetch was wired; the addEventListener path must not
		// depend on onabort, so an external abort still cancels.
		external.onabort = () => {};
		external.dispatchEvent(new MockEvent('abort'));

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(calls[0].signal.aborted).toBe(true);
		expect(isCancelError(error)).toBe(true);
	});

	it('leaves no residual listeners on a long-lived signal after many settled fetches', async () => {
		const external = new NativeLikeAbortSignal();
		const backing = deferredFetch();
		const cancelableFetch = cancelableFetchFactory({
			fetch: backing.fetch,
			AbortController: MockAbortController as any,
		});

		for (let i = 0; i < 20; i++) {
			const promise = cancelableFetch('/api', { signal: external });
			await flush();
			backing.resolveWith('ok');
			await promise;
		}

		expect(external.listeners).toHaveLength(0);
	});

	it('detaches the listener after a rejected fetch too', async () => {
		const external = new NativeLikeAbortSignal();
		const backing = deferredFetch();
		const cancelableFetch = cancelableFetchFactory({
			fetch: backing.fetch,
			AbortController: MockAbortController as any,
		});

		const promise = cancelableFetch('/api', { signal: external });
		await flush();
		backing.rejectWith(new Error('network down'));

		try {
			await promise;
		} catch {
			// expected network error
		}

		expect(external.listeners).toHaveLength(0);
	});

	it('short-circuits a pre-aborted native signal', async () => {
		const external = new NativeLikeAbortSignal();
		external.aborted = true;

		const { promise, calls } = makeNativeFactory(external);

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(calls[0].signal.aborted).toBe(true);
		expect(isCancelError(error)).toBe(true);
	});

	it('falls back to onabort for a polyfill without addEventListener', async () => {
		const external = new OnabortOnlyAbortSignal();
		const backing = deferredFetch();
		const cancelableFetch = cancelableFetchFactory({
			fetch: backing.fetch,
			AbortController: MockAbortController as any,
		});

		const promise = cancelableFetch('/api', { signal: external });
		await flush();

		expect(typeof external.onabort).toBe('function');
		external.fireAbort(new MockEvent('abort'));

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(backing.calls[0].signal.aborted).toBe(true);
		expect(isCancelError(error)).toBe(true);
	});
});


// Deferred fetch honoring a REAL (native) AbortSignal: rejects with the signal's `reason` on abort,
// exactly as a spec-compliant fetch does. Used to exercise the createCancelSignal reuse path (no
// injected AbortController), where the signal already aborts with a CancelError.
function nativeSignalFetch() {
	const calls: Array<{ input: any; init: any; signal: any }> = [];
	let settle: { resolve: (v: any) => void; reject: (e: any) => void } | null = null;

	const fetch = jest.fn((input: any, init?: any) => {
		calls.push({ input, init, signal: init?.signal });
		return new Promise((resolve, reject) => {
			settle = { resolve, reject };
			const signal: AbortSignal | undefined = init?.signal;
			if (signal) {
				const rejectWithReason = () => reject(signal.reason as Error);
				if (signal.aborted) {
					rejectWithReason();
					return;
				}
				signal.addEventListener('abort', rejectWithReason);
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

describe('cancel-signal reuse (no injected AbortController)', () => {
	it('cancels the underlying fetch with a clean CancelError on .cancel()', async () => {
		const backing = nativeSignalFetch();
		// No AbortController in config: the factory reuses createCancelSignal (native AbortController).
		const cancelableFetch = cancelableFetchFactory({ fetch: backing.fetch });

		const promise = cancelableFetch('/api');
		await flush();
		expect(backing.calls[0].signal.aborted).toBe(false);

		promise.cancel();

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		// mock fetch records the underlying abort, and the rejection is a clean CancelError.
		expect(backing.calls[0].signal.aborted).toBe(true);
		expect(isCancelError(error)).toBe(true);
	});

	it('maps an external native-signal abort to a CancelError', async () => {
		const external = new AbortController();
		const backing = nativeSignalFetch();
		const cancelableFetch = cancelableFetchFactory({ fetch: backing.fetch });

		const promise = cancelableFetch('/api', { signal: external.signal });
		await flush();

		external.abort();

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(backing.calls[0].signal.aborted).toBe(true);
		expect(isCancelError(error)).toBe(true);
	});

	it('forwards an injected cancel signal so it cancels with its CancelError verbatim', async () => {
		const { cancel, signal } = createCancelSignal();
		const reason = new CancelError('stop it');
		const backing = nativeSignalFetch();
		const cancelableFetch = cancelableFetchFactory({ fetch: backing.fetch });

		const promise = cancelableFetch('/api', { signal });
		await flush();

		cancel(reason);

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(isCancelError(error)).toBe(true);
		expect(error).toBe(reason);
	});

	it('rejects immediately for a pre-aborted native signal', async () => {
		const external = new AbortController();
		external.abort();
		const backing = nativeSignalFetch();
		const cancelableFetch = cancelableFetchFactory({ fetch: backing.fetch });

		const promise = cancelableFetch('/api', { signal: external.signal });

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(backing.calls[0].signal.aborted).toBe(true);
		expect(isCancelError(error)).toBe(true);
	});

	it('forwards an external non-cancel init.signal into the underlying fetch', async () => {
		const external = new AbortController();
		const backing = nativeSignalFetch();
		const cancelableFetch = cancelableFetchFactory({ fetch: backing.fetch });

		const promise = cancelableFetch('/api', { signal: external.signal, method: 'POST' });
		await flush();

		// The underlying fetch gets our minted signal, not the caller's, and the init is preserved.
		expect(backing.calls[0].init.method).toBe('POST');
		expect(backing.calls[0].signal).toBeInstanceOf(AbortSignal);

		backing.resolveWith('ok');
		await promise;
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
