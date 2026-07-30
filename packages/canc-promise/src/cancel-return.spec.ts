import vm from 'vm';
import { CancelablePromise } from './cancelable-promise';
import { CancelError } from './cancel-error';
import { isCancelError } from './helpers';

/**
 * cancel() always-return contract, CancelError cause wrapping, and brand.
 */

const NativePromise = Promise;

function macrotask(): Promise<void> {
	return new NativePromise(resolve => setTimeout(resolve, 10));
}

describe('cancel() return contract', () => {
	it('asyncCancel: cancel() returns a promise even with no handlers (empty allSettled)', async () => {
		const promise = new CancelablePromise(() => {/**/}, { asyncCancel: true });
		const result = promise.cancel('reason');

		expect(result).toBeInstanceOf(CancelablePromise);

		const settled = await (result as CancelablePromise<PromiseSettledResult<unknown>[]>);
		expect(settled).toEqual([]);
	});

	it('asyncCancel: awaiting cancel() resolves only after async handlers settle (ordering)', async () => {
		const order: string[] = [];

		const promise = new CancelablePromise((_resolve, _reject, { handleCancel }) => {
			handleCancel(() => new NativePromise<void>(resolve => setTimeout(() => {
				order.push('handler');
				resolve();
			}, 20)));
		}, { asyncCancel: true });

		const settlement = promise.cancel('reason') as CancelablePromise<PromiseSettledResult<unknown>[]>;
		await settlement;
		order.push('after-await');

		expect(order).toEqual(['handler', 'after-await']);
	});

	it('asyncCancel: handler throw -> allSettled has a rejected entry, no unhandled rejection', async () => {
		const promise = new CancelablePromise((_resolve, _reject, { handleCancel }) => {
			handleCancel(() => {
				throw new Error('handler boom');
			});
		}, { asyncCancel: true });

		const settlement = promise.cancel('reason') as CancelablePromise<PromiseSettledResult<unknown>[]>;
		const results = await settlement;

		expect(results).toHaveLength(1);
		expect(results[0].status).toBe('rejected');
		expect((results[0] as PromiseRejectedResult).reason.message).toBe('handler boom');

		// The cancellation itself is suppressed.
		await expect(promise).rejects.toBeInstanceOf(CancelError);
	});

	it('sync mode (asyncCancel:false): cancel() returns undefined', () => {
		const promise = new CancelablePromise(() => {/**/}, { asyncCancel: false });
		const result = promise.cancel('reason');

		expect(result).toBeUndefined();
		promise.catch(() => {/**/});
	});
});

describe('cancel(reason) wrapping', () => {
	it('cancel(plainObject): rejection is a CancelError with cause === object', async () => {
		const reason = { code: 42, detail: 'nope' };
		const promise = new CancelablePromise(() => {/**/});

		 
		promise.cancel(reason);

		const error: any = await promise.catch(e => e);
		expect(isCancelError(error)).toBe(true);
		expect(error).toBeInstanceOf(CancelError);
		expect(error.cause).toBe(reason);
	});

	it('cancel(string): rejection is a CancelError with the message', async () => {
		const promise = new CancelablePromise(() => {/**/});

		 
		promise.cancel('gone');

		const error: any = await promise.catch(e => e);
		expect(isCancelError(error)).toBe(true);
		expect(error.message).toBe('gone');
	});

	it('cancel(CancelError): passthrough, not re-wrapped', async () => {
		const original = new CancelError('original');
		const promise = new CancelablePromise(() => {/**/});

		 
		promise.cancel(original);

		const error: any = await promise.catch(e => e);
		expect(error).toBe(original);
		expect(error.cause).toBeUndefined();
	});

	it('cancel(): default CancelError, no cause', async () => {
		const promise = new CancelablePromise(() => {/**/});

		 
		promise.cancel();

		const error: any = await promise.catch(e => e);
		expect(isCancelError(error)).toBe(true);
		expect('cause' in error).toBe(false);
	});
});

describe('CancelError brand cross-realm', () => {
	it('recognizes a CancelError branded in another realm via Symbol.for', () => {
		// A separate realm's Symbol.for('@cancjs/promise:CancelError') is the SAME symbol
		// (global registry) -> brand is copy/realm-immune by construction.
		const foreignBranded = vm.runInNewContext(`
			const err = new Error('cross-realm');
			err.name = 'CancelError';
			err[Symbol.for('@cancjs/promise:CancelError')] = true;
			err;
		`);

		// Sanity: it is genuinely a foreign object (not our CancelError instance).
		expect(foreignBranded instanceof CancelError).toBe(false);
		expect(isCancelError(foreignBranded)).toBe(true);
	});

	it('does NOT recognize a foreign CancelError-named error lacking the brand (cross-realm)', () => {
		const foreignUnbranded = vm.runInNewContext(`
			const err = new Error('impostor');
			err.name = 'CancelError';
			err;
		`);

		expect(isCancelError(foreignUnbranded)).toBe(false);
	});
});

describe('suppression parity for wrapped/branded reasons', () => {
	it('no unhandled rejection when cancel wraps a plain object', async () => {
		const promise = new CancelablePromise(() => {/**/});
		 
		promise.cancel({ arbitrary: true });

		await macrotask();
		// Reaching here without an unhandled rejection crashing the run is the assertion;
		// observe the settled state.
		expect(promise.isCanceled).toBe(true);
	});
});
