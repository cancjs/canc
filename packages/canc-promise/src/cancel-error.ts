export class CancelError extends Error {
	readonly [Symbol.toStringTag]!: string;

	name: string;
	isBubbled: boolean;

	constructor(reason = '') {
		super(reason);

		Object.setPrototypeOf(this, new.target.prototype);

		// Init instance properties after prototype swap
		this.name = 'CancelError';
		this.isBubbled = false;
	}
}
