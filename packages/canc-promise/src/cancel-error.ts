export interface ICancelErrorOptions {
	cause?: any;
}

export class CancelError extends Error {
	readonly [Symbol.toStringTag]!: string;

	name: string;
	isBubbled: boolean;
	cause?: any;

	constructor(reason = '', options?: ICancelErrorOptions) {
		super(reason);

		Object.setPrototypeOf(this, new.target.prototype);

		// Init instance properties after prototype swap
		this.name = 'CancelError';
		this.isBubbled = false;
		if (options?.cause !== undefined) {
			this.cause = options.cause;
		}
	}
}
