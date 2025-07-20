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
	bubbled: boolean;
	// Marks a CancelError produced by explicit resource disposal via Symbol.dispose /
	// Symbol.asyncDispose. Lets consumers distinguish a scope-exit disposal cancel from an
	// ordinary cancel().
	disposed: boolean;
	cause?: any;
	readonly [CANCEL_ERROR_BRAND]!: true;

	/** @deprecated use `bubbled` */
	get isBubbled(): boolean {
		return this.bubbled;
	}

	set isBubbled(value: boolean) {
		this.bubbled = value;
	}

	constructor(reason = '', options?: ICancelErrorOptions) {
		super(reason);

		Object.setPrototypeOf(this, new.target.prototype);

		// Init instance properties after prototype swap
		this.name = 'CancelError';
		this.bubbled = false;
		this.disposed = false;
		// Brand: identifies genuine canc CancelError instances regardless of realm/copy.
		this[CANCEL_ERROR_BRAND] = true;
		if (options?.cause !== undefined) {
			this.cause = options.cause;
		}
	}

	// True when this cancellation originated from an AbortSignal. A signal abort is threaded through
	// cancel() as the `cause` of the CancelError (the raw DOMException AbortError is never used as the
	// rejection reason directly), so an abort-driven cancel is one whose cause is an AbortError. The
	// name check mirrors isAbortError in helpers; it stays inlined here to avoid a module cycle
	// (helpers imports CancelError).
	get aborted(): boolean {
		const cause = this.cause as { name?: unknown } | null | undefined;

		return typeof cause === 'object' && cause !== null && cause.name === 'AbortError';
	}
}
