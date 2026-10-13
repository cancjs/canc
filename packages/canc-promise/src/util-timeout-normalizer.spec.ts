import {
  AbortError,
  isCancelError,
  TIMEOUT_ERROR_BRAND,
  TimeoutError,
  toCancelError,
  toCancelErrorFactory,
} from '../../_util';
import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';

describe('timeout reason normalizer', () => {
  describe('spec table', () => {
    it('normalizes AbortSignal.timeout(1) reason to CancelError with timedOut true and cause', async () => {
      const signal = AbortSignal.timeout(1);
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
      const reason = signal.reason;

      const normalized = toCancelError(reason, CancelError);

      expect(normalized).toBeInstanceOf(CancelError);
      expect(normalized.timedOut).toBe(true);
      expect(normalized.cause).toBe(reason);
    });

    it('normalizes node DOMException TimeoutError to CancelError with timedOut true and cause', () => {
      const domException = new DOMException('', 'TimeoutError');

      const normalized = toCancelError(domException, CancelError);

      expect(normalized).toBeInstanceOf(CancelError);
      expect(normalized.timedOut).toBe(true);
      expect(normalized.cause).toBe(domException);
    });

    it('normalizes canc TimeoutError to CancelError with timedOut true and cause', () => {
      const cancTimeout = new TimeoutError();

      const normalized = toCancelError(cancTimeout, CancelError);

      expect(normalized).toBeInstanceOf(CancelError);
      expect(normalized.timedOut).toBe(true);
      expect(normalized.cause).toBe(cancTimeout);
    });

    it('normalizes foreign object with name TimeoutError to CancelError with timedOut true and cause', () => {
      const foreignTimeout = { name: 'TimeoutError' };

      const normalized = toCancelError(foreignTimeout, CancelError);

      expect(normalized).toBeInstanceOf(CancelError);
      expect(normalized.timedOut).toBe(true);
      expect(normalized.cause).toBe(foreignTimeout);
    });

    it('passes through CancelError verbatim with preserved timedOut and cause', () => {
      const plainCancel = new CancelError('user cancellation');
      const normalizedPlain = toCancelError(plainCancel, CancelError);

      expect(normalizedPlain).toBe(plainCancel);
      expect(normalizedPlain.timedOut).toBe(false);
      expect(normalizedPlain.cause).toBeUndefined();

      const timeoutCause = new TimeoutError();
      const timeoutCancel = new CancelError(undefined, { cause: timeoutCause });
      const normalizedTimeout = toCancelError(timeoutCancel, CancelError);

      expect(normalizedTimeout).toBe(timeoutCancel);
      expect(normalizedTimeout.timedOut).toBe(true);
      expect(normalizedTimeout.cause).toBe(timeoutCause);
    });

    it('normalizes string reason to CancelError with timedOut false and cause', () => {
      const reason = 'explicit cancellation';

      const normalized = toCancelError(reason, CancelError);

      expect(normalized).toBeInstanceOf(CancelError);
      expect(normalized.timedOut).toBe(false);
      expect(normalized.cause).toBe(reason);
    });
  });

  describe('equality check against core CancelablePromise', () => {
    it('matches timedOut on a core CancelablePromise canceled by a timed-out signal', async () => {
      const signal = AbortSignal.timeout(10);
      const promise = new CancelablePromise<void>(() => {}, { signal });

      let coreError!: CancelError;
      try {
        await promise;
      } catch (error) {
        coreError = error as CancelError;
      }

      const normalized = toCancelError(signal.reason, CancelError);

      expect(normalized.timedOut).toBe(coreError.timedOut);
      expect(normalized.timedOut).toBe(true);
      expect(normalized.cause).toBe(signal.reason);
    });
  });

  describe('additional normalization behaviors', () => {
    it('normalizes AbortError to CancelError with timedOut false, aborted true, and cause', () => {
      const abort = new AbortError('aborted');

      const normalized = toCancelError(abort, CancelError);

      expect(normalized).toBeInstanceOf(CancelError);
      expect(normalized.timedOut).toBe(false);
      expect(normalized.aborted).toBe(true);
      expect(normalized.cause).toBe(abort);
    });

    it('works with toCancelErrorFactory providing prebound normalizer', () => {
      const normalize = toCancelErrorFactory({ CancelError });
      const foreignTimeout = { name: 'TimeoutError' };

      const normalized = normalize(foreignTimeout);

      expect(normalized).toBeInstanceOf(CancelError);
      expect(normalized.timedOut).toBe(true);
      expect(normalized.cause).toBe(foreignTimeout);
    });

    it('produces a branded CancelError with full parity when makeCancelError is omitted', () => {
      const foreignTimeout = { name: 'TimeoutError' };
      const defaultTimeout = toCancelError(foreignTimeout);

      expect(isCancelError(defaultTimeout)).toBe(true);
      expect((defaultTimeout as any).timedOut).toBe(true);
      expect((defaultTimeout as any).cause).toBe(foreignTimeout);
      expect((defaultTimeout as any).bubbled).toBe(false);
      expect((defaultTimeout as any).disposed).toBe(false);
      expect((defaultTimeout as any).isBubbled).toBe(false);
      expect((defaultTimeout as any)._cancErrorBrand).toBe('@cancjs/promise:CancelError');
      expect(Object.prototype.toString.call(defaultTimeout)).toBe('[object CancelError]');

      const defaultString = toCancelError('cancel reason');

      expect(isCancelError(defaultString)).toBe(true);
      expect((defaultString as any).timedOut).toBe(false);
      expect((defaultString as any).cause).toBe('cancel reason');
      expect((defaultString as any).message).toBe('cancel reason');

      const abort = new AbortError('aborted');
      const defaultAbort = toCancelError(abort);

      expect(isCancelError(defaultAbort)).toBe(true);
      expect((defaultAbort as any).aborted).toBe(true);
      expect((defaultAbort as any).timedOut).toBe(false);
      expect((defaultAbort as any).cause).toBe(abort);
    });

    it('normalizes custom error subclass carrying prototype brand without TimeoutError name', () => {
      class CustomBrandedTimeout extends Error {
        name = 'CustomTimeout';
        constructor() {
          super();
          Object.setPrototypeOf(this, new.target.prototype);
        }
      }
      Object.defineProperty(CustomBrandedTimeout.prototype, TIMEOUT_ERROR_BRAND, { value: true });

      const customTimeout = new CustomBrandedTimeout();
      const normalized = toCancelError(customTimeout, CancelError);

      expect(normalized).toBeInstanceOf(CancelError);
      expect(normalized.timedOut).toBe(true);
      expect(normalized.cause).toBe(customTimeout);
    });

    it('normalizes undefined and null reasons to CancelError with timedOut false', () => {
      const normalizedUndefined = toCancelError(undefined, CancelError);

      expect(normalizedUndefined).toBeInstanceOf(CancelError);
      expect(normalizedUndefined.timedOut).toBe(false);
      expect(normalizedUndefined.cause).toBeUndefined();

      const normalizedNull = toCancelError(null, CancelError);

      expect(normalizedNull).toBeInstanceOf(CancelError);
      expect(normalizedNull.timedOut).toBe(false);
      expect(normalizedNull.cause).toBeNull();
    });

    it('normalizes using a non-constructor factory function', () => {
      const makeCancel = (message?: string, options?: { cause?: unknown }) => new CancelError(message, options);
      const foreignTimeout = { name: 'TimeoutError' };

      const normalized = toCancelError(foreignTimeout, makeCancel);

      expect(normalized).toBeInstanceOf(CancelError);
      expect(normalized.timedOut).toBe(true);
      expect(normalized.cause).toBe(foreignTimeout);
    });
  });
});
