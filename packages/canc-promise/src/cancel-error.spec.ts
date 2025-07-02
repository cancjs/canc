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

	// Default-param branch (`reason = ''`): explicit `undefined` argument (arg present, triggers
	// default substitution) vs the omitted-arg case above.
	it('defaults message when reason is explicitly undefined', () => {
		expect(new CancelError(undefined).message).toBe('');
	});

	it('has isBubbled property', () => {
		const error = new CancelError();

		expect(error.isBubbled).toBe(false);
		error.isBubbled = true;
		expect(error.isBubbled).toBe(true);
	});

	// Arbitrary reason preserved via `cause` (native Error cause parity).
	it('accepts a cause option', () => {
		const cause = { some: 'object' };
		const error = new CancelError('boom', { cause });

		expect(error.cause).toBe(cause);
		expect(error.message).toBe('boom');
	});

	it('omits cause when not provided', () => {
		expect('cause' in new CancelError()).toBe(false);
	});

	// Options object provided but without a `cause` key (distinct branch from "no options at
	// all" above and from "cause provided" above).
	it('omits cause when options given without cause', () => {
		expect('cause' in new CancelError('boom', {})).toBe(false);
	});
});

describe('CancelError brand', () => {
	const BRAND = Symbol.for('@cancjs/promise:CancelError');

	it('carries the shared Symbol.for brand', () => {
		expect((new CancelError() as any)[BRAND]).toBe(true);
	});

	it('isCancelError matches by brand, not name', () => {
		expect(isCancelError(new CancelError())).toBe(true);
	});

	// Regression: foreign Error with name 'CancelError' must NOT be matched.
	it('isCancelError rejects a foreign error merely named CancelError', () => {
		const foreign = new Error('impostor');
		foreign.name = 'CancelError';

		expect(isCancelError(foreign)).toBe(false);
	});

	it('isCancelError rejects a plain branded-name lookalike without the brand', () => {
		expect(isCancelError({ name: 'CancelError', message: '' })).toBe(false);
	});
});
