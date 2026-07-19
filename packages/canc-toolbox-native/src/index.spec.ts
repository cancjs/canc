import { delay } from './index';
import * as native from './index';

describe('index exports', () => {
	it('exposes the reduced timing/retry/promisify surface, nothing canc-only', () => {
		const keys = Object.keys(native).sort();
		expect(keys).toEqual(
			['TimeoutError', 'defer', 'delay', 'isTimeoutError', 'minDelay', 'promisify', 'promisifyAll', 'retry', 'timeout', 'waitFor'].sort(),
		);
	});

	it('("cancel" in delay(1)) is false: returned promises are never cancelable', () => {
		expect('cancel' in delay(1)).toBe(false);
	});
});
