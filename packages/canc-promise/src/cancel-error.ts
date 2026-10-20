import { isAbortError, isTimeoutError } from '../../_util';

export interface ICancelErrorOptions {
  cause?: any;
}

/**
 * App-wide brand: a Symbol.for registry entry is the SAME symbol across realms and across
 * duplicated package copies, so branding by it is collision-proof by construction. Detection keys
 * on this brand, not on `name` (which any third-party error can spoof), see isCancelError in
 * helpers.
 */
export const CANCEL_ERROR_BRAND = Symbol.for('@cancjs/promise:CancelError');

/** Brand key as the string the reviver reads back across a worker boundary, same value as the symbol's key. */
const CANCEL_ERROR_KEY = '@cancjs/promise:CancelError';

export class CancelError extends Error {
  readonly [Symbol.toStringTag]!: string;
  declare readonly [CANCEL_ERROR_BRAND]: true;

  name: string;
  bubbled: boolean;
  // Marks a CancelError produced by explicit resource disposal via Symbol.dispose /
  // Symbol.asyncDispose.
  // Lets consumers distinguish a scope-exit disposal cancel from an
  // ordinary cancel().
  disposed: boolean;
  cause?: any;

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
    // the string marker a worker's structured clone keeps, see `_util/errors.ts`
    Object.defineProperty(this, '_cancErrorBrand', { value: CANCEL_ERROR_KEY, configurable: true });
    this.bubbled = false;
    this.disposed = false;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }

  // abort threads through cancel() as the cause, never as the rejection itself
  get aborted(): boolean {
    return isAbortError(this.cause);
  }

  // timeout threads through cancel() as the cause, never as the rejection itself
  get timedOut(): boolean {
    return isTimeoutError(this.cause);
  }
}

// Brand on the prototype rather than per instance: every instance still answers the lookup through
// the prototype chain, and no error carries an own symbol property that enumeration, cloning or
// serialization could trip over.
// Non-enumerable and non-writable by defineProperty default.
Object.defineProperty(CancelError.prototype, CANCEL_ERROR_BRAND, { value: true });
Object.defineProperty(CancelError.prototype, '_cancErrorBrand', { value: CANCEL_ERROR_KEY });
