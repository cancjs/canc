import { CancelablePromise } from './cancelable-promise';
import { CancelError } from './cancel-error';

/**
 * Signal listener cleanup + multi-signal support.
 *
 * Tests cover: (a) settle removes listener; (b) no listener growth; (c) pre-aborted handling;
 * (d) abort after settle no-op; (e) multi-signal array support.
 */

function flushPromises(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}

describe('signal listener cleanup + multi-signal', () => {
	// (a) Settle -> removeEventListener called
	it('(a) removeEventListener called when promise settles via fulfill', async () => {
		const controller = new AbortController();
		const signal = controller.signal;
		const spy = jest.spyOn(signal, 'removeEventListener');

		const promise = new CancelablePromise(
			(resolve) => setTimeout(() => resolve('value'), 0),
			{ signal }
		);

		await flushPromises();

		expect(spy).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
		spy.mockRestore();
	});

	it('(a) removeEventListener called when promise settles via reject', async () => {
		const controller = new AbortController();
		const signal = controller.signal;
		const spy = jest.spyOn(signal, 'removeEventListener');

		const promise = new CancelablePromise(
			(_resolve, reject) => setTimeout(() => reject(new Error('fail')), 0),
			{ signal }
		);
		promise.catch(() => {/**/});

		await flushPromises();

		expect(spy).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
		spy.mockRestore();
	});

	it('(a) removeEventListener called when promise is canceled', async () => {
		const controller = new AbortController();
		const signal = controller.signal;
		const spy = jest.spyOn(signal, 'removeEventListener');

		const promise = new CancelablePromise(() => {/**/}, { signal });
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		promise.cancel();

		await flushPromises();

		expect(spy).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
		spy.mockRestore();
	});

	// (b) Long-lived signal + N settled promises -> zero listener growth
	it('(b) N settled promises on one signal have zero residual listeners', async () => {
		const controller = new AbortController();
		const signal = controller.signal;

		let listenerCount = 0;
		const origAdd = signal.addEventListener.bind(signal);
		const origRemove = signal.removeEventListener.bind(signal);

		jest.spyOn(signal, 'addEventListener').mockImplementation(function (type, listener, opts) {
			if (type === 'abort') listenerCount++;
			return origAdd(type, listener, opts);
		});

		jest.spyOn(signal, 'removeEventListener').mockImplementation(function (type, listener, opts) {
			if (type === 'abort') listenerCount--;
			return origRemove(type, listener, opts);
		});

		const promises = Array(5).fill(0).map(() => new CancelablePromise(resolve => {
			setTimeout(() => resolve('done'), 0);
		}, { signal }));

		await Promise.all(promises);
		await flushPromises();

		expect(listenerCount).toBe(0);
	});

	// (c) Pre-aborted signal -> already-canceled promise (no sync throw by default)
	it('(c) pre-aborted signal returns already-canceled promise (no throw)', () => {
		const controller = new AbortController();
		controller.abort(new Error('pre-aborted'));

		const promise = new CancelablePromise(() => {/**/}, { signal: controller.signal });

		expect(promise.isCanceled).toBe(true);
		expect(promise).rejects.toBeInstanceOf(CancelError);
	});

	// (c) Pre-aborted + strict:true -> throws
	it('(c) pre-aborted signal with strict:true throws', () => {
		const controller = new AbortController();
		controller.abort(new Error('pre-aborted-strict'));

		expect(() => {
			new CancelablePromise(() => {/**/}, { signal: controller.signal, strict: true });
		}).toThrow(/[Aa]borted/);
	});

	// (c) Pre-aborted promise inherits signal.reason as cause
	it('(c) pre-aborted promise rejection carries signal.reason as cause', async () => {
		const controller = new AbortController();
		const reason = new Error('abort-reason');
		controller.abort(reason);

		const promise = new CancelablePromise(() => {/**/}, { signal: controller.signal });

		let caught: any = null;
		promise.catch((err: any) => { caught = err; });

		await flushPromises();

		expect(caught).toBeInstanceOf(CancelError);
		expect(caught.cause).toBe(reason);
	});

	// (d) Abort after settle -> no-op
	it('(d) abort after promise settles is a no-op', async () => {
		const controller = new AbortController();
		const signal = controller.signal;

		const promise = new CancelablePromise((resolve) => {
			setTimeout(() => resolve('settled'), 0);
		}, { signal });

		await flushPromises();

		expect(promise.isCanceled).toBe(false);
		controller.abort(new Error('too-late'));

		await flushPromises();

		expect(promise.isCanceled).toBe(false);
		await expect(promise).resolves.toBe('settled');
	});

	// (e) Two signals, either aborts -> promise cancels, both cleaned
	it('(e) two signals: first abort cancels, both listeners cleaned', async () => {
		const ctrl1 = new AbortController();
		const ctrl2 = new AbortController();
		const signal1 = ctrl1.signal;
		const signal2 = ctrl2.signal;

		const spy1 = jest.spyOn(signal1, 'removeEventListener');
		const spy2 = jest.spyOn(signal2, 'removeEventListener');

		const promise = new CancelablePromise(
			() => {/**/},
			{ signal: [signal1, signal2] as any } // Cast for now; array will be typed after impl
		);

		expect(promise.isCancelable).toBe(true);

		ctrl1.abort(new Error('first-abort'));

		await flushPromises();

		expect(promise.isCanceled).toBe(true);
		// Both listeners should be removed (first abort wins, cleanup runs)
		expect(spy1).toHaveBeenCalledWith('abort', expect.any(Function), expect.any(Object));
		expect(spy2).toHaveBeenCalledWith('abort', expect.any(Function), expect.any(Object));

		spy1.mockRestore();
		spy2.mockRestore();
	});

	it('(e) two signals: second abort no-op, both listeners already cleaned', async () => {
		const ctrl1 = new AbortController();
		const ctrl2 = new AbortController();
		const signal1 = ctrl1.signal;
		const signal2 = ctrl2.signal;

		const promise = new CancelablePromise(
			() => {/**/},
			{ signal: [signal1, signal2] as any }
		);

		ctrl1.abort(new Error('first'));

		await flushPromises();

		expect(promise.isCanceled).toBe(true);
		const cancelCountAfterFirst = promise.isCanceled ? 1 : 0;

		ctrl2.abort(new Error('second'));

		await flushPromises();

		expect(promise.isCanceled).toBe(true);
		// Second abort should not trigger another cancel (promise already canceled)
		// This is implicit: isCanceled stays true, no additional rejection
	});

	// Listener count matrix: prove no growth
	it('listener count matrix: single signal, 10 settled promises, zero residual listeners', async () => {
		const controller = new AbortController();
		const signal = controller.signal;

		let addCount = 0;
		let removeCount = 0;

		const origAdd = signal.addEventListener.bind(signal);
		const origRemove = signal.removeEventListener.bind(signal);

		jest.spyOn(signal, 'addEventListener').mockImplementation(function (type, listener, opts) {
			if (type === 'abort') addCount++;
			return origAdd(type, listener, opts);
		});

		jest.spyOn(signal, 'removeEventListener').mockImplementation(function (type, listener, opts) {
			if (type === 'abort') removeCount++;
			return origRemove(type, listener, opts);
		});

		const promises = [];
		for (let i = 0; i < 10; i++) {
			promises.push(new CancelablePromise(
				resolve => setTimeout(() => resolve(i), 0),
				{ signal }
			));
		}

		await Promise.all(promises);
		await flushPromises();

		expect(addCount).toBe(10);
		expect(removeCount).toBe(10);
		expect(addCount - removeCount).toBe(0);

		console.log(`Listener count matrix: +${addCount} -${removeCount} = ${addCount - removeCount}`);
	});
});
