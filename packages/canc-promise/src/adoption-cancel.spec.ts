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
 *
 * Matrix: adoption path (then / catch / finally / executor resolve / resolve with differing
 * options / allSettled's internal .then wrap) x adopted kind (pending, already-settled,
 * already-canceled CancelablePromise; shared inner; bubble:false; shield:true; a plain native
 * promise; a foreign thenable that happens to expose a duck-typed .cancel; a plain value) x
 * expectation (cancel reaches it / does not, consumer-count rule for shared inners). The
 * coroutine control row (cancAsync/cancAwait) lives in canc-coroutine's own spec directory,
 * since canc-promise carries no dependency on canc-coroutine.
 */

const NativePromise = Promise;

// Deterministic microtask flush: draining the queue lets a handler run and adopt its return value.
function flush(): Promise<void> {
	return NativePromise.resolve().then(() => undefined);
}

function makeInner(): { promise: CancelablePromise<number>; canceled: () => boolean } {
	let canceled = false;
	const promise = new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
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
		const shared = new CancelablePromise<number>((resolve, _reject, { handleCancel }) => {
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
		const shared = new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
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
		const inner = new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
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
		const inner = new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
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
		const b = new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
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

	it('already-canceled adopted inner: no-op, no throw', async () => {
		const inner = new CancelablePromise<number>(() => undefined);
		inner.cancel();
		await flush();
		expect(inner.isCanceled).toBe(true);

		const outer = CancelablePromise.resolve().then(() => inner);
		outer.catch(() => undefined);

		await flush();
		await flush();

		expect(() => outer.cancel()).not.toThrow();
		await flush();
	});

	it('foreign thenable with a duck-typed cancel: adoption does not invoke it (brand-only gate)', async () => {
		// Not a CancelablePromise (no CANCEL_PROMISE_BRAND), so it must take the unchanged-behavior
		// path even though it happens to expose a `.cancel` method (e.g. a LAZY promise or any other
		// thenable-with-cancel). The adoption branch keys strictly on the brand, never duck-typing.
		let cancelCalled = false;
		const foreign: PromiseLike<number> & { cancel: () => void } = {
			then(onFulfilled) {
				setTimeout(() => onFulfilled?.(9), 5);
				return NativePromise.resolve() as unknown as PromiseLike<never>;
			},
			cancel() {
				cancelCalled = true;
			},
		};
		const outer = CancelablePromise.resolve().then(() => foreign);
		outer.catch(() => undefined);

		await flush();
		await flush();

		outer.cancel();
		await flush();

		expect(cancelCalled).toBe(false);
	});

	it('plain value returned: unchanged behavior, no adoption branch entered', async () => {
		const outer = CancelablePromise.resolve().then(() => 42);
		outer.catch(() => undefined);

		await flush();
		await flush();

		expect(() => outer.cancel()).not.toThrow();
		await expect(outer.catch((e) => e)).resolves.toBeDefined();
	});

	it('CancelablePromise.resolve(inner, optionsThatDiffer): wraps (not identity), cancel does not reach a shielded wrapper', async () => {
		let innerCanceled = false;
		const inner = new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
			handleCancel(() => {
				innerCanceled = true;
			});
		});

		// Options differ from defaultOptions (shield defaults false), so the identity fast path in
		// resolve() does not apply: a new wrapper is constructed and adoption runs through the same
		// executor-resolve hook as `new CancelablePromise((resolve) => resolve(inner))`.
		const wrapped = CancelablePromise.resolve(inner, { shield: true });
		expect(wrapped).not.toBe(inner);
		wrapped.catch(() => undefined);

		await flush();
		await flush();

		// shield:true is on the wrapper itself (upward/self shield), so the wrapper's own cancel()
		// no-ops before it ever reaches the adoption link; the inner stays untouched either way.
		wrapped.cancel();
		await flush();

		expect(innerCanceled).toBe(false);
		expect(inner.isCanceled).toBe(false);
	});

	it('CancelablePromise.resolve(inner, optionsThatDiffer) without shield: wrapping still forwards cancel to the adopted inner', async () => {
		let innerCanceled = false;
		const inner = new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
			handleCancel(() => {
				innerCanceled = true;
			});
		});

		// strict differs from the default (false), forcing the wrap without shielding the wrapper's
		// own cancel, so this isolates the adoption-forward from the shield no-op above.
		const wrapped = CancelablePromise.resolve(inner, { strict: true });
		expect(wrapped).not.toBe(inner);
		wrapped.catch(() => undefined);

		await flush();
		await flush();

		wrapped.cancel();
		await flush();

		expect(innerCanceled).toBe(true);
		expect(inner.isCanceled).toBe(true);
	});

	it('allSettled: a cancelable item keeps its declared-parent link through the internal .then wrap (control, not a new adoption path)', async () => {
		// allSettled wraps every input in `_adopt(item).then(toSettledResult)` internally. This is not
		// a new handler-return adoption path (the item is a declared ancestor of allSettled's
		// per-item derived child, same as any `.then()` source), but it must keep working post-fix:
		// canceling the allSettled RESULT does not reach a still-pending item (existing loser
		// doctrine, see cancel-losers.spec.ts), while the item settling still flows through to the
		// result's {status, value} entry untouched by the new adoption branch.
		const item = CancelablePromise.resolve(5);
		const result = await CancelablePromise.allSettled([item]);

		expect(result).toEqual([{ status: 'fulfilled', value: 5 }]);
	});

	it('allSettled: a still-pending cancelable item is NOT canceled by canceling the result (doctrine unchanged by adoption fix)', async () => {
		let itemCanceled = false;
		const item = new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
			handleCancel(() => {
				itemCanceled = true;
			});
		});

		const result = CancelablePromise.allSettled([item]);
		result.catch(() => undefined);

		await flush();
		await flush();

		result.cancel();
		await flush();

		expect(itemCanceled).toBe(false);
		expect(item.isCanceled).toBe(false);
	});
});
