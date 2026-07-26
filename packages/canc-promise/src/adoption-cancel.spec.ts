import { CancelablePromise } from './cancelable-promise';

/**
 * Adoption cancel propagation: when a handler (or an executor's resolve) returns a
 * CancelablePromise, canceling the chain must reach that adopted promise, subject to the same
 * consumer-count rule a declared parent obeys. Non-cancelable returns keep their old behavior.
 *
 * The adopted promise is linked as a counted parent of the child, and the child subscribes to its
 * settlement, so an adopted promise never leaks an unhandled rejection here (no explicit `.catch`
 * on the adopted promise is needed, and adding one would register a second bubble consumer that
 * skews the count under test).
 */

const NativePromise = Promise;

// Deterministic microtask flush: draining the queue lets a handler run and adopt its return value.
function flush(): Promise<void> {
	return NativePromise.resolve().then(() => undefined);
}

function makeInner(): { promise: CancelablePromise<number>; canceled: () => boolean } {
	let canceled = false;
	const promise = new CancelablePromise<number>((_resolve, _reject, handleCancel) => {
		handleCancel(() => {
			canceled = true;
		});
	});
	return { promise, canceled: () => canceled };
}

describe('adoption cancel propagation', () => {
	it('then() return: canceling the outer cancels the adopted inner', async () => {
		const inner = makeInner();
		const outer = CancelablePromise.resolve().then(() => inner.promise);
		outer.catch(() => undefined);

		await flush();
		await flush();

		outer.cancel();
		await flush();

		expect(inner.canceled()).toBe(true);
		expect(inner.promise.canceled).toBe(true);
	});

	it('catch() return on a rejected source: canceling the outer cancels the adopted inner', async () => {
		const inner = makeInner();
		const source = new CancelablePromise<number>((_resolve, reject) => reject(new Error('boom')));
		const outer = source.catch(() => inner.promise);
		outer.catch(() => undefined);

		await flush();
		await flush();

		outer.cancel();
		await flush();

		expect(inner.canceled()).toBe(true);
		expect(inner.promise.canceled).toBe(true);
	});

	it('finally() return: canceling the outer cancels the adopted inner', async () => {
		const inner = makeInner();
		const outer = CancelablePromise.resolve(1).finally(() => inner.promise);
		outer.catch(() => undefined);

		await flush();
		await flush();
		await flush();

		outer.cancel();
		await flush();

		expect(inner.canceled()).toBe(true);
		expect(inner.promise.canceled).toBe(true);
	});

	it('executor resolve(inner): canceling the outer cancels the adopted inner', async () => {
		const inner = makeInner();
		const outer = new CancelablePromise<number>((resolve) => resolve(inner.promise));
		outer.catch(() => undefined);

		await flush();

		outer.cancel();
		await flush();

		expect(inner.canceled()).toBe(true);
		expect(inner.promise.canceled).toBe(true);
	});

	it('shared inner: canceling one consumer does NOT cancel the shared inner; the other still settles', async () => {
		let resolveShared: (v: number) => void = () => undefined;
		let sharedCanceled = false;
		const shared = new CancelablePromise<number>((resolve, _reject, handleCancel) => {
			resolveShared = resolve;
			handleCancel(() => {
				sharedCanceled = true;
			});
		});

		const t1 = CancelablePromise.resolve();
		const t2 = CancelablePromise.resolve();
		const a = t1.then(() => shared);
		const b = t2.then(() => shared);
		a.catch(() => undefined);

		await flush();
		await flush();

		a.cancel();
		await flush();

		expect(sharedCanceled).toBe(false);
		expect(shared.canceled).toBe(false);

		// b still settles with the shared value.
		resolveShared(7);
		await expect(b).resolves.toBe(7);
	});

	it('shared inner: canceling the last live consumer NOW cancels the shared inner', async () => {
		let sharedCanceled = false;
		const shared = new CancelablePromise<number>((_resolve, _reject, handleCancel) => {
			handleCancel(() => {
				sharedCanceled = true;
			});
		});

		const t1 = CancelablePromise.resolve();
		const t2 = CancelablePromise.resolve();
		const a = t1.then(() => shared);
		const b = t2.then(() => shared);
		a.catch(() => undefined);
		b.catch(() => undefined);

		await flush();
		await flush();

		a.cancel();
		await flush();
		expect(sharedCanceled).toBe(false);

		b.cancel();
		await flush();
		expect(sharedCanceled).toBe(true);
		expect(shared.canceled).toBe(true);
	});

	it('bubble:false adopted inner: cancel does NOT reach it', async () => {
		let innerCanceled = false;
		const inner = new CancelablePromise<number>((_resolve, _reject, handleCancel) => {
			handleCancel(() => {
				innerCanceled = true;
			});
		}, { bubble: false });

		const outer = CancelablePromise.resolve().then(() => inner);
		outer.catch(() => undefined);

		await flush();
		await flush();

		outer.cancel();
		await flush();

		expect(innerCanceled).toBe(false);
		expect(inner.canceled).toBe(false);
	});

	it('shield:true adopted inner: cancel does NOT reach it', async () => {
		let innerCanceled = false;
		const inner = new CancelablePromise<number>((_resolve, _reject, handleCancel) => {
			handleCancel(() => {
				innerCanceled = true;
			});
		}, { shield: true });

		const outer = CancelablePromise.resolve().then(() => inner);
		outer.catch(() => undefined);

		await flush();
		await flush();

		outer.cancel();
		await flush();

		expect(innerCanceled).toBe(false);
		expect(inner.canceled).toBe(false);
	});

	it('already-settled adopted inner: no-op, no throw', async () => {
		const inner = CancelablePromise.resolve(5);
		const outer = CancelablePromise.resolve().then(() => inner);
		outer.catch(() => undefined);

		await flush();
		await flush();

		expect(() => outer.cancel()).not.toThrow();
		await flush();

		// The already-fulfilled inner is unaffected.
		await expect(inner).resolves.toBe(5);
	});

	it('plain native promise returned: unchanged behavior (documented gap)', async () => {
		let nativeResolve: (v: number) => void = () => undefined;
		const nativeInner = new NativePromise<number>((resolve) => {
			nativeResolve = resolve;
		});
		const outer = CancelablePromise.resolve().then(() => nativeInner);
		outer.catch(() => undefined);

		await flush();
		await flush();

		// Canceling the outer must not throw and must not affect the native inner.
		expect(() => outer.cancel()).not.toThrow();
		await flush();

		nativeResolve(3);
		await expect(nativeInner).resolves.toBe(3);
	});

	it('chained adoption: handler returns A which later resolves to cancelable B; canceling outer reaches B', async () => {
		let bCanceled = false;
		const b = new CancelablePromise<number>((_resolve, _reject, handleCancel) => {
			handleCancel(() => {
				bCanceled = true;
			});
		});

		let resolveA: (v: CancelablePromise<number>) => void = () => undefined;
		const a = new CancelablePromise<number>((resolve) => {
			resolveA = resolve as any;
		});

		const outer = CancelablePromise.resolve().then(() => a);
		outer.catch(() => undefined);

		await flush();
		await flush();

		// A adopts B.
		resolveA(b);
		await flush();
		await flush();

		outer.cancel();
		await flush();
		await flush();

		expect(bCanceled).toBe(true);
		expect(b.canceled).toBe(true);
	});

	it('p.then(() => p): native TypeError, no cycle, no hang', async () => {
		const p: CancelablePromise<any> = CancelablePromise.resolve();
		let chained: CancelablePromise<any>;
		// Self-adoption: the handler returns the very promise `then` produced. Native resolution
		// rejects with a TypeError; our new branch must not run before that and must not deadlock.
		chained = p.then(() => chained);

		await expect(chained).rejects.toBeInstanceOf(TypeError);
	});
});
