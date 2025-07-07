import { CancelError } from './cancel-error';
import { isAbortError } from './helpers';

function makeAbortError(reason = 'aborted'): Error {
	// A DOMException in modern runtimes, but the detection keys on `name` so a plain Error stand-in
	// works everywhere the test runs.
	try {
		const controller = new AbortController();
		controller.abort();
		return controller.signal.reason as Error;
	} catch {
		const error = new Error(reason);
		error.name = 'AbortError';
		return error;
	}
}

describe('isAbortError', () => {
	it('matches a real AbortController abort reason', () => {
		expect(isAbortError(makeAbortError())).toBe(true);
	});

	it('matches any error whose name is AbortError', () => {
		const error = new Error('nope');
		error.name = 'AbortError';
		expect(isAbortError(error)).toBe(true);
	});

	it('rejects a plain Error', () => {
		expect(isAbortError(new Error('boom'))).toBe(false);
	});

	it('rejects a CancelError with no abort cause', () => {
		expect(isAbortError(new CancelError('canceled'))).toBe(false);
	});

	it('rejects non-object inputs', () => {
		expect(isAbortError(undefined)).toBe(false);
		expect(isAbortError(null)).toBe(false);
		expect(isAbortError('AbortError')).toBe(false);
	});
});

describe('CancelError.aborted', () => {
	it('is true when the cause is an AbortError', () => {
		const error = new CancelError(undefined, { cause: makeAbortError() });
		expect(error.aborted).toBe(true);
	});

	it('is false for an ordinary cancel with no cause', () => {
		expect(new CancelError('canceled').aborted).toBe(false);
	});

	it('is false when the cause is a non-abort error', () => {
		expect(new CancelError(undefined, { cause: new Error('other') }).aborted).toBe(false);
	});
});
