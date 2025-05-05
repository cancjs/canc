import { CancelError } from './cancel-error';
import { isCancelError } from './helpers';

describe('CancelError', () => {
	it('is ES5 class', () => {
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

	it('has isBubbled property', () => {
		const error = new CancelError();

		expect(error.isBubbled).toBe(false);
		error.isBubbled = true;
		expect(error.isBubbled).toBe(true);
	});
});
