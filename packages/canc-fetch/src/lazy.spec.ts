import { isCancelError } from '@cancjs/promise';

import { cancelableLazyFetchFactory, cancelableLazyFetchLaterFactory } from './lazy';


// Reuse mock classes from base.spec.ts
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

// A FetchLaterResult stand-in whose `activated` flips true after `flipAfter` reads of the getter.
function makeFetchLaterResult(flipAfter = 1) {
	let reads = 0;
	return {
		get activated(): boolean {
			return reads++ >= flipAfter;
		},
	};
}

function flushTimers(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}


describe('cancelableLazyFetchFactory', () => {
	it('does not call fetch until the lazy promise is subscribed', async () => {
		const backing = deferredFetch();
		const lazyFetch = cancelableLazyFetchFactory({
			fetch: backing.fetch,
			AbortController: MockAbortController as any,
		});

		const promise = lazyFetch('/api');
		expect(backing.calls).toHaveLength(0);

		const subscription = promise.then(() => 'resolved');
		expect(backing.calls).toHaveLength(1);

		backing.resolveWith('ok');
		await subscription;
	});

	it('does not call fetch if canceled before subscription', async () => {
		const backing = deferredFetch();
		const lazyFetch = cancelableLazyFetchFactory({
			fetch: backing.fetch,
			AbortController: MockAbortController as any,
		});

		const promise = lazyFetch('/api');
		promise.cancel();

		expect(backing.calls).toHaveLength(0);

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(isCancelError(error)).toBe(true);
	});

	it('aborts the underlying fetch on cancel after subscription', async () => {
		const backing = deferredFetch();
		const lazyFetch = cancelableLazyFetchFactory({
			fetch: backing.fetch,
			AbortController: MockAbortController as any,
		});

		const promise = lazyFetch('/api');
		const subscription = promise.then();

		expect(backing.calls).toHaveLength(1);
		expect(backing.calls[0].signal.aborted).toBe(false);

		promise.cancel();
		expect(backing.calls[0].signal.aborted).toBe(true);

		let error: any;
		try {
			await subscription;
		} catch (e) {
			error = e;
		}

		expect(isCancelError(error)).toBe(true);
	});
});


describe('cancelableLazyFetchLaterFactory', () => {
	it('does not call fetchLater until the lazy promise is subscribed', async () => {
		const result = makeFetchLaterResult(0);
		const fetchLater = jest.fn(() => result);

		const lazyFetchLater = cancelableLazyFetchLaterFactory({
			fetchLater: fetchLater as any,
			AbortController: MockAbortController as any,
			pollInterval: 5,
		});

		const promise = lazyFetchLater('/api', { activateAfter: 1000 });

		// Not started yet: fetchLater not called, `.activated` reads null.
		expect(fetchLater).not.toHaveBeenCalled();
		expect((promise as any).activated).toBeNull();

		const resolved = await promise;

		expect(fetchLater).toHaveBeenCalledTimes(1);
		expect(resolved).toBe(result);
		expect((promise as any).activated).toBe(true);
	});

	it('never calls fetchLater when canceled before subscription', async () => {
		const fetchLater = jest.fn(() => makeFetchLaterResult(0));

		const lazyFetchLater = cancelableLazyFetchLaterFactory({
			fetchLater: fetchLater as any,
			AbortController: MockAbortController as any,
			pollInterval: 5,
		});

		const promise = lazyFetchLater('/api', { activateAfter: 1000 });
		promise.cancel();

		expect(fetchLater).not.toHaveBeenCalled();
		expect((promise as any).activated).toBeNull();

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(isCancelError(error)).toBe(true);
		expect(fetchLater).not.toHaveBeenCalled();
	});

	it('polls the FetchLaterResult after start and resolves once activated flips', async () => {
		const result = makeFetchLaterResult(2);
		const fetchLater = jest.fn(() => result);

		const lazyFetchLater = cancelableLazyFetchLaterFactory({
			fetchLater: fetchLater as any,
			AbortController: MockAbortController as any,
			pollInterval: 5,
		});

		const promise = lazyFetchLater('/api', { activateAfter: 1000 });
		const subscription = promise.then((r: any) => r);

		// After subscription the underlying fetchLater ran; `.activated` is now live.
		await flushTimers();
		expect(fetchLater).toHaveBeenCalledTimes(1);
		expect(typeof (promise as any).activated).toBe('boolean');

		const resolved = await subscription;
		expect(resolved).toBe(result);
	});

	it('rejects with the raw error when a deferred fetchLater throws synchronously', async () => {
		const rangeError = new RangeError('negative activateAfter');
		const fetchLater = jest.fn(() => { throw rangeError; });

		const lazyFetchLater = cancelableLazyFetchLaterFactory({
			fetchLater: fetchLater as any,
			AbortController: MockAbortController as any,
		});

		const promise = lazyFetchLater('/api', { activateAfter: -1 });

		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(error).toBe(rangeError);
		expect(isCancelError(error)).toBe(false);
	});
});
