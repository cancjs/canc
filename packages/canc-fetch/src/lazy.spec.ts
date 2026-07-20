import { CancelError, isCancelError } from '@cancjs/promise';

import { lazyFetchFactory, fetchLaterFactory } from './lazy';


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


describe('lazyFetchFactory', () => {
	it('does not call fetch until the lazy promise is subscribed', async () => {
		const backing = deferredFetch();
		const lazyFetch = lazyFetchFactory({
			fetch: backing.fetch,
			AbortController: MockAbortController as any,
		});

		// Create the lazy promise but do NOT await it yet.
		const promise = lazyFetch('/api');

		// Fetch should not have been called.
		expect(backing.calls).toHaveLength(0);

		// Now subscribe via .then
		const subscription = promise.then(() => 'resolved');

		// Now fetch SHOULD have been called.
		expect(backing.calls).toHaveLength(1);

		// Settle it to avoid unhandled rejection.
		backing.resolveWith('ok');
		await subscription;
	});

	it('does not call fetch if canceled before subscription', async () => {
		const backing = deferredFetch();
		const lazyFetch = lazyFetchFactory({
			fetch: backing.fetch,
			AbortController: MockAbortController as any,
		});

		const promise = lazyFetch('/api');

		// Cancel before any subscription.
		promise.cancel();

		// Fetch should never have been called.
		expect(backing.calls).toHaveLength(0);

		// Awaiting should reject with a CancelError.
		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(isCancelError(error)).toBe(true);
	});

	it('rejects immediately if canceled before subscription, no fetch call', async () => {
		const backing = deferredFetch();
		const lazyFetch = lazyFetchFactory({
			fetch: backing.fetch,
			AbortController: MockAbortController as any,
		});

		const promise = lazyFetch('/api');
		promise.cancel();

		// Multiple subscriptions should all see the same cached cancellation.
		let error1: any, error2: any;

		try {
			await promise.then();
		} catch (e) {
			error1 = e;
		}

		try {
			await promise.then();
		} catch (e) {
			error2 = e;
		}

		expect(isCancelError(error1)).toBe(true);
		expect(isCancelError(error2)).toBe(true);
		expect(backing.calls).toHaveLength(0);
	});

	it('aborts the underlying fetch on cancel after subscription', async () => {
		const backing = deferredFetch();
		const lazyFetch = lazyFetchFactory({
			fetch: backing.fetch,
			AbortController: MockAbortController as any,
		});

		const promise = lazyFetch('/api');

		// Subscribe to trigger the executor.
		const subscription = promise.then();

		// Now the fetch should be pending.
		expect(backing.calls).toHaveLength(1);
		expect(backing.calls[0].signal.aborted).toBe(false);

		// Cancel the lazy promise.
		promise.cancel();

		// The signal should be aborted.
		expect(backing.calls[0].signal.aborted).toBe(true);

		// The subscription should reject with a CancelError.
		let error: any;
		try {
			await subscription;
		} catch (e) {
			error = e;
		}

		expect(isCancelError(error)).toBe(true);
	});
});


describe('fetchLaterFactory', () => {
	it('does not call fetch until the lazy promise is subscribed', async () => {
		const backing = deferredFetch();
		const fetchLater = fetchLaterFactory({
			fetch: backing.fetch,
			AbortController: MockAbortController as any,
		});

		// Create the lazy promise but do NOT await it yet.
		const promise = fetchLater('/api');

		// Fetch should not have been called.
		expect(backing.calls).toHaveLength(0);

		// Now subscribe via .then
		const subscription = promise.then(() => 'resolved');

		// Now fetch SHOULD have been called.
		expect(backing.calls).toHaveLength(1);

		// Settle it to avoid unhandled rejection.
		backing.resolveWith('ok');
		await subscription;
	});

	it('respects a delay before calling fetch after subscription', async () => {
		const backing = deferredFetch();
		const fetchLater = fetchLaterFactory(
			{
				fetch: backing.fetch,
				AbortController: MockAbortController as any,
			},
			50 // 50ms delay
		);

		const promise = fetchLater('/api');

		// Subscribe.
		const subscription = promise.then();

		// Immediately after subscribe, before the delay, fetch should NOT be called.
		expect(backing.calls).toHaveLength(0);

		// Wait for the delay.
		await new Promise(resolve => setTimeout(resolve, 60));

		// Now fetch should have been called.
		expect(backing.calls).toHaveLength(1);

		// Clean up.
		backing.resolveWith('ok');
		await subscription;
	});

	it('does not call fetch if canceled before subscription (with delay)', async () => {
		const backing = deferredFetch();
		const fetchLater = fetchLaterFactory(
			{
				fetch: backing.fetch,
				AbortController: MockAbortController as any,
			},
			50
		);

		const promise = fetchLater('/api');

		// Cancel before subscription, before the delay fires.
		promise.cancel();

		// Wait for the delay to pass.
		await new Promise(resolve => setTimeout(resolve, 60));

		// Fetch should never have been called because we canceled before subscribing.
		expect(backing.calls).toHaveLength(0);

		// Awaiting should reject with a CancelError.
		let error: any;
		try {
			await promise;
		} catch (e) {
			error = e;
		}

		expect(isCancelError(error)).toBe(true);
	});

	it('cancels the delayed fetch if canceled after the delay fires', async () => {
		const backing = deferredFetch();
		const fetchLater = fetchLaterFactory(
			{
				fetch: backing.fetch,
				AbortController: MockAbortController as any,
			},
			50
		);

		const promise = fetchLater('/api');

		// Subscribe.
		const subscription = promise.then();

		// Wait for the delay to pass.
		await new Promise(resolve => setTimeout(resolve, 60));

		// Fetch should now be pending.
		expect(backing.calls).toHaveLength(1);
		expect(backing.calls[0].signal.aborted).toBe(false);

		// Cancel.
		promise.cancel();

		// The signal should be aborted.
		expect(backing.calls[0].signal.aborted).toBe(true);

		// The subscription should reject with a CancelError.
		let error: any;
		try {
			await subscription;
		} catch (e) {
			error = e;
		}

		expect(isCancelError(error)).toBe(true);
	});

	it('cancels the pending timeout if canceled before delay fires', async () => {
		const backing = deferredFetch();
		const fetchLater = fetchLaterFactory(
			{
				fetch: backing.fetch,
				AbortController: MockAbortController as any,
			},
			100 // long delay
		);

		const promise = fetchLater('/api');
		const subscription = promise.then();

		// Immediately cancel before delay.
		promise.cancel();

		// Wait longer than the original delay to be sure.
		await new Promise(resolve => setTimeout(resolve, 150));

		// Fetch should never have been called because the timeout was cleared on cancel.
		expect(backing.calls).toHaveLength(0);

		let error: any;
		try {
			await subscription;
		} catch (e) {
			error = e;
		}

		expect(isCancelError(error)).toBe(true);
	});
});


describe('lazy fetch and fetchLater signal sharing', () => {
	it('both lazyFetch and fetchLater share the setupCancellation wiring', async () => {
		const backingLazy = deferredFetch();
		const backingLater = deferredFetch();

		const lazyFetch = lazyFetchFactory({
			fetch: backingLazy.fetch,
			AbortController: MockAbortController as any,
		});
		const fetchLater = fetchLaterFactory({
			fetch: backingLater.fetch,
			AbortController: MockAbortController as any,
		});

		// Create both promises and subscribe.
		const lazySub = lazyFetch('/api/lazy').then();
		const laterSub = fetchLater('/api/later').then();

		// Both should have called their respective fetches with an AbortSignal from our wiring.
		expect(backingLazy.calls[0].signal).toBeDefined();
		expect(backingLater.calls[0].signal).toBeDefined();

		// Both signals should be from our minted AbortController (not inherited from elsewhere).
		expect(backingLazy.calls[0].signal).toBeInstanceOf(MockAbortSignal);
		expect(backingLater.calls[0].signal).toBeInstanceOf(MockAbortSignal);

		// Canceling each promise should abort its respective signal independently.
		const lazyProm = lazyFetch('/api/lazy-2').then();
		const laterProm = fetchLater('/api/later-2').then();

		lazyProm.cancel('lazy canceled');

		// Lazy's signal should be aborted; later's should not.
		expect(backingLazy.calls[1].signal.aborted).toBe(true);
		expect(backingLater.calls[1].signal.aborted).toBe(false);

		// Clean up.
		backingLazy.resolveWith('ok');
		backingLater.resolveWith('ok');
		await Promise.all([lazySub, laterSub]);
	});
});
