import { CancelablePromise } from '@cancjs/promise';
import * as canc from './index';
import * as native from './native';

describe('native twin', () => {
	it('binds native Promise: delay returns a plain Promise, not CancelablePromise', async () => {
		const promise = native.delay(1, 'v');
		expect(promise).toBeInstanceOf(Promise);
		expect(promise).not.toBeInstanceOf(CancelablePromise);
		await expect(promise).resolves.toBe('v');
	});

	it('ignores the registry: native delay stays a plain Promise even with an impl registered', async () => {
		// Registry is a canc-entry concern; the native twin is prebound and does not consult it.
		const promise = native.delay(1, 'v');
		expect(promise).not.toBeInstanceOf(CancelablePromise);
		await promise;
	});

	it('exposes the reduced export set (timing + retry helpers, no pluggable-impl surface)', () => {
		const nativeKeys = Object.keys(native).sort();
		expect(nativeKeys).toEqual(
			['TimeoutError', 'defer', 'delay', 'isTimeoutError', 'minDelay', 'promisify', 'promisifyAll', 'retry', 'timeout', 'waitFor'].sort(),
		);
	});

	it('excludes canc-only helpers and factories that the main entry ships', () => {
		const cancKeys = new Set(Object.keys(canc));
		const nativeKeys = new Set(Object.keys(native));

		// Factories and the cancelable-only defer are canc-entry only.
		for (const cancOnly of ['delayFactory', 'timeoutFactory', 'deferFactory', 'retryFactory', 'waitForFactory', 'minDelayFactory', 'deferCancelable']) {
			expect(cancKeys.has(cancOnly)).toBe(true);
			expect(nativeKeys.has(cancOnly)).toBe(false);
		}
	});
});
