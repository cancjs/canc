import { CancelError, isCancelError } from './cancel-error';


declare var describe: any, it: any, expect: any, jest: any;

describe('CancelError', () => {
	it('is ES5 class', () => {
		const error = new CancelError();

		expect(CancelError).toEqual(expect.any(Function));
		expect(CancelError.toString()).toEqual(expect.not.stringMatching(/^class /));
	});

	it('is custom error', () => {
		const error = new CancelError();

		expect(error).toEqual(expect.any(Error));
		expect(error).toEqual(expect.any(CancelError));
		expect(error.name).toBe('CancelError');
	});

	it('accepts optional message', () => {
		expect(new CancelError().message).toBe('');
		expect(new CancelError('foo').message).toBe('foo');
	});
});

describe('isCancelError', () => {
	it('strictly detects cancel error', () => {
		expect(isCancelError(new CancelError())).toBe(true);
	});

	it('duck-types cancel error', () => {
		expect(isCancelError({ message: '', name: 'CancelError' })).toBe(true);
	});

	it('does not detect other errors', () => {
		expect(isCancelError(new Error())).toBe(false);
		expect(isCancelError(new TypeError())).toBe(false);
	});
});