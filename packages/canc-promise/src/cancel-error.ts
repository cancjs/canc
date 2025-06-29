export interface ICancelErrorOptions {
	cause?: any;
}

// Agent-wide brand: a Symbol.for registry entry is the SAME symbol across realms and across
// duplicated package copies, so branding by it is collision-proof by construction. Detection keys
// on this brand, not on `name` (which any third-party error can spoof), see isCancelError in
// helpers.
export const CANCEL_ERROR_BRAND = Symbol.for('@cancjs/promise:CancelError');

export class CancelError extends Error {
	readonly [Symbol.toStringTag]!: string;

	name: string;
	isBubbled: boolean;
	// Marks a CancelError produced by explicit resource disposal via Symbol.dispose /
	// Symbol.asyncDispose. Lets consumers distinguish a scope-exit disposal cancel from an
	// ordinary cancel().
	isDisposed: boolean;
	cause?: any;
	readonly [CANCEL_ERROR_BRAND]!: true;

	constructor(reason = '', options?: ICancelErrorOptions) {
		super(reason);

		Object.setPrototypeOf(this, new.target.prototype);

		// Init instance properties after prototype swap
		this.name = 'CancelError';
		this.isBubbled = false;
		this.isDisposed = false;
		// Brand: identifies genuine canc CancelError instances regardless of realm/copy.
		this[CANCEL_ERROR_BRAND] = true;
		if (options?.cause !== undefined) {
			this.cause = options.cause;
		}
	}
}
