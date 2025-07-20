import { CancelablePromise } from '@cancjs/promise';
import { timeout } from './timeout';
import { minDelay } from './min-delay';
import { waitFor } from './wait-for';
import { retry } from './retry';
import { suppress, interopTimeout, withSignal } from './abort-interop';

// regression: internal subscriptions (`promise.then(...)`) used to be built off a bare
// `Promise.resolve(...)` call, a live global lookup. Under a zone.js-style monkeypatch that
// replaces the global Promise constructor, that lookup silently starts constructing through the
// patched global instead of the resolved implementation. These probes patch `global.Promise` with
// a marker constructor and assert none of the affected utilities ever construct through it.
//
// Test bodies deliberately avoid `async`/`await`: this workspace targets es5 (invariant 3), so an
// `async` function here would itself compile through TypeScript's `__awaiter` helper, which reads
// the *live* global `Promise` (`new (P || (P = Promise))(...)`) to drive its own state machine.
// That is a harness artifact, not a product bug, but it would pollute the construction count with
// promises the test itself created. Returning a plain `.then()` chain sidesteps the helper.
describe('zone-swap probe: toolbox does not subscribe via the live global Promise', () => {
	let RealPromise: typeof Promise;
	let patchedConstructed: unknown[];

	beforeEach(() => {
		jest.useFakeTimers();
		RealPromise = global.Promise;
		patchedConstructed = [];

		// A plain function constructor (not `class extends Promise`) that builds a real native
		// promise via Reflect.construct and records every instance it produced, mirroring the
		// marker-impl approach used by precedence.spec.ts. Avoids native engine internal-slot
		// pitfalls that a subclassed Promise triggers on its own static resolve/then machinery.
		function PatchedPromise(this: unknown, executor: (resolve: (value: unknown) => void, reject: (reason?: any) => void) => void) {
			const instance = Reflect.construct(RealPromise, [executor], PatchedPromise as any);
			patchedConstructed.push(instance);
			return instance;
		}
		PatchedPromise.prototype = Object.create(RealPromise.prototype);
		(PatchedPromise as any).resolve = RealPromise.resolve.bind(RealPromise);
		(PatchedPromise as any).reject = RealPromise.reject.bind(RealPromise);
		(PatchedPromise as any).race = RealPromise.race.bind(RealPromise);
		(PatchedPromise as any).all = RealPromise.all.bind(RealPromise);

		// Zone-style global swap: replace the global binding, not just a local alias.
		(global as any).Promise = PatchedPromise;
	});

	afterEach(() => {
		(global as any).Promise = RealPromise;
		jest.useRealTimers();
	});

	it('timeout: source subscription does not construct through the patched global', () => {
		const raced = timeout(RealPromise.resolve('v'), 1000);

		// Flush the already-fulfilled source's microtask BEFORE advancing the deadline timer, so the
		// race settles via the fast path (source wins) instead of runAllTimers firing the 1000ms
		// deadline synchronously ahead of the microtask resolution.
		return RealPromise.resolve()
			.then(() => RealPromise.resolve())
			.then(() => {
				jest.runAllTimers();

				return raced.then((value) => {
					expect(value).toBe('v');
					expect(patchedConstructed.length).toBe(0);
				});
			});
	});

	it('minDelay: source subscription does not construct through the patched global', () => {
		const raced = minDelay(RealPromise.resolve('v'), 10);
		jest.runAllTimers();

		return raced.then((value) => {
			expect(value).toBe('v');
			expect(patchedConstructed.length).toBe(0);
		});
	});

	it('waitFor: condition subscription does not construct through the patched global', () => {
		const done = waitFor(() => true, { interval: 10 });
		jest.runAllTimers();

		return done.then((value) => {
			expect(value).toBeUndefined();
			expect(patchedConstructed.length).toBe(0);
		});
	});

	it('retry: attempt subscription does not construct through the patched global', () => {
		const done = retry(() => RealPromise.resolve('ok'));
		jest.runAllTimers();

		return done.then((value) => {
			expect(value).toBe('ok');
			expect(patchedConstructed.length).toBe(0);
		});
	});

	it('suppress: source subscription does not construct through the patched global', () => {
		const done = suppress(['cancel'], RealPromise.resolve('ok'));

		return done.then((value) => {
			expect(value).toBe('ok');
			expect(patchedConstructed.length).toBe(0);
		});
	});

	it('interopTimeout: source subscription does not construct through the patched global', () => {
		const done = interopTimeout(RealPromise.resolve('ok'), 1000);

		return done.then((value) => {
			expect(value).toBe('ok');
			expect(patchedConstructed.length).toBe(0);
		});
	});

	it('withSignal (no Impl in scope): still resolves via the module-captured native Promise', () => {
		// withSignal has no toolbox options / resolved Impl; it must use the module-level captured
		// NativePromise const rather than the live (patched) global.
		const done = withSignal(undefined, RealPromise.resolve('ok'));

		return done.then((value) => {
			expect(value).toBe('ok');
			expect(patchedConstructed.length).toBe(0);
		});
	});

	it('default export construction still goes through CancelablePromise, unaffected by the patch', () => {
		const raced = minDelay(RealPromise.resolve('v'), 10);
		jest.runAllTimers();

		return raced.then(() => {
			expect(raced).toBeInstanceOf(CancelablePromise);
		});
	});
});
