import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';
import { cancelify, cancelifyFactory, makeCancelSignal } from './signal-thread';

// A minimal AbortController stand-in that records construction and abort calls, so tests can assert
// that reading (or not reading) the injected signal controls whether a controller is ever built.
function makeSpyControllerCtor() {
	const instances: Array<{ aborted: boolean; reason: any; signal: any }> = [];
	const ctor = jest.fn(function SpyController(this: any) {
		const state = { aborted: false, reason: undefined as any };
		const listeners: Array<(this: any, ev: any) => void> = [];
		const signal = {
			get aborted() {
				return state.aborted;
			},
			get reason() {
				return state.reason;
			},
			addEventListener(_type: string, cb: (this: any, ev: any) => void) {
				listeners.push(cb);
			},
			removeEventListener() {
				/* noop */
			},
		};
		this.signal = signal;
		this.abort = (reason?: any) => {
			state.aborted = true;
			state.reason = reason;
			for (const cb of listeners) cb.call(signal, {});
		};
		instances.push({
			get aborted() {
				return state.aborted;
			},
			get reason() {
				return state.reason;
			},
			signal,
		});
	}) as unknown as new () => { abort(reason?: any): void; signal: any };

	return { ctor, instances };
}

describe('makeCancelSignal', () => {
	it('yields undefined when there is no handleCancel (native impl)', () => {
		expect(makeCancelSignal(undefined).signal).toBeUndefined();
	});

	it('lazily materializes on first touch and forwards reads/writes/has to the real signal', () => {
		const { ctor } = makeSpyControllerCtor();
		let registered: ((reason?: any) => void) | undefined;
		const handleCancel = jest.fn((onCancel: (reason?: any) => void) => {
			registered = onCancel;
		});

		const holder = makeCancelSignal(handleCancel as any, ctor);
		// Capturing the signal must not build a controller.
		const signal = holder.signal;
		expect(ctor).not.toHaveBeenCalled();

		// First property read materializes the controller and wires a single cancel handler.
		expect(signal.aborted).toBe(false);
		expect(ctor).toHaveBeenCalledTimes(1);
		expect(handleCancel).toHaveBeenCalledTimes(1);

		// has + set traps forward to the real signal.
		expect('aborted' in signal).toBe(true);
		signal.custom = 7;
		expect(signal.custom).toBe(7);
		// getPrototypeOf trap.
		expect(Object.getPrototypeOf(signal)).not.toBeNull();

		// The wired handler brands the reason.
		registered!('boom');
		expect(signal.aborted).toBe(true);
		expect(isCancelError(signal.reason)).toBe(true);
		expect(signal.reason.cause).toBeUndefined();
		expect(signal.reason.message).toBe('boom');
	});

	it('passes an existing CancelError reason through unwrapped', () => {
		const { ctor } = makeSpyControllerCtor();
		let registered: ((reason?: any) => void) | undefined;
		const handleCancel = ((onCancel: (reason?: any) => void) => {
			registered = onCancel;
		}) as any;

		const signal = makeCancelSignal(handleCancel, ctor).signal;
		expect(signal.aborted).toBe(false);

		const existing = new CancelError('already');
		registered!(existing);
		expect(signal.reason).toBe(existing);
	});

	it('wraps a non-CancelError object reason as the cause', () => {
		const { ctor } = makeSpyControllerCtor();
		let registered: ((reason?: any) => void) | undefined;
		const handleCancel = ((onCancel: (reason?: any) => void) => {
			registered = onCancel;
		}) as any;

		const signal = makeCancelSignal(handleCancel, ctor).signal;
		expect(signal.aborted).toBe(false);

		const cause = { code: 'X' };
		registered!(cause);
		expect(isCancelError(signal.reason)).toBe(true);
		expect(signal.reason.cause).toBe(cause);
	});
});

describe('cancelify', () => {
	it('materializes the ambient AbortController when none is injected', async () => {
		let aborted: boolean | undefined;
		const wrapped = cancelify((signal: any) => {
			aborted = signal.aborted;
			return new Promise<never>(() => {});
		});

		const promise = wrapped() as CancelablePromise<never>;
		await Promise.resolve();
		expect(aborted).toBe(false);

		promise.cancel();
		const reason = await promise.catch((e) => e);
		expect(isCancelError(reason)).toBe(true);
	});

	it('passes the outbound signal and the call-args array to fn', async () => {
		let received: { signal: any; args: any[] } | undefined;
		const wrapped = cancelify((signal: any, args: any[]) => {
			received = { signal, args };
			return 'ok';
		});

		await expect(wrapped('a', 1, true)).resolves.toBe('ok');
		expect(received).toBeDefined();
		expect(received!.args).toEqual(['a', 1, true]);
		expect(received!.signal).toBeDefined();
	});

	it('aborts the injected signal with a CancelError reason when the promise is canceled', async () => {
		const { ctor, instances } = makeSpyControllerCtor();
		let captured: any;
		const wrapped = cancelify(
			(signal: any) => {
				captured = signal;
				// Touch the signal the way a real consumer (fetch) would, materializing the controller.
				expect(signal.aborted).toBe(false);
				// Never settle, so the cancel window stays open.
				return new Promise<never>(() => {});
			},
			{ AbortController: ctor },
		);

		const promise = wrapped() as CancelablePromise<never>;
		// Let the executor run and read the signal.
		await Promise.resolve();
		expect(ctor).toHaveBeenCalledTimes(1);
		expect(captured.aborted).toBe(false);

		promise.cancel();

		expect(instances[0].aborted).toBe(true);
		expect(isCancelError(instances[0].reason)).toBe(true);
		expect(captured.aborted).toBe(true);

		const reason = await promise.catch((e) => e);
		expect(isCancelError(reason)).toBe(true);
	});

	it('allocates NO controller when fn never reads the signal', async () => {
		const { ctor } = makeSpyControllerCtor();
		const wrapped = cancelify(() => 'value', { AbortController: ctor });

		await expect(wrapped()).resolves.toBe('value');
		expect(ctor).not.toHaveBeenCalled();
	});

	it('rejects when fn rejects (reject passthrough)', async () => {
		const error = new Error('boom');
		const wrapped = cancelify(() => Promise.reject(error));
		await expect(wrapped()).rejects.toBe(error);
	});

	it('uses the injected AbortController ctor, not the global', async () => {
		const { ctor } = makeSpyControllerCtor();
		let sig: any;
		const wrapped = cancelify(
			(signal: any) => {
				// Touch a property so the injected ctor is exercised (lazy: capture alone would not).
				sig = signal.aborted === false ? signal : signal;
				return 'x';
			},
			{ AbortController: ctor },
		);

		await wrapped();
		expect(ctor).toHaveBeenCalledTimes(1);
		expect(sig).toBeDefined();
	});

	describe('lazy', () => {
		it('does not call fn until the promise is awaited', async () => {
			const fn = jest.fn(() => 'late');
			const wrapped = cancelify(fn, { lazy: true });

			const promise = wrapped();
			expect(fn).not.toHaveBeenCalled();

			await expect(Promise.resolve(promise)).resolves.toBe('late');
			expect(fn).toHaveBeenCalledTimes(1);
		});

		it('never calls fn when canceled before the first await', async () => {
			const fn = jest.fn(() => 'never');
			const wrapped = cancelify(fn, { lazy: true });

			const promise = wrapped() as unknown as CancelablePromise<string>;
			promise.cancel('gone');

			const reason = await Promise.resolve(promise).catch((e) => e);
			expect(isCancelError(reason)).toBe(true);
			expect(fn).not.toHaveBeenCalled();
		});
	});

	describe('native impl', () => {
		it('hands fn signal === undefined and still runs it', async () => {
			let sig: any = 'sentinel';
			const nativeCancelify = cancelifyFactory(Promise as any);
			const wrapped = nativeCancelify((signal: any) => {
				sig = signal;
				return 'native';
			});

			await expect(wrapped()).resolves.toBe('native');
			expect(sig).toBeUndefined();
		});
	});
});
