import { TIMEOUT_ERROR_BRAND, TimeoutError, toCancelError, toCancelErrorFactory } from '../../_util';
import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';

describe('timeout reason normalizer', () => {
  const tableCases: Array<{
    label: string;
    getReason: () => Promise<unknown> | string | number | null | undefined | object;
  }> = [
    { label: 'string', getReason: () => 'explicit cancellation' },
    { label: 'number', getReason: () => 42 },
    { label: 'null', getReason: () => null },
    { label: 'undefined', getReason: () => undefined },
    { label: 'plain object', getReason: () => ({ custom: 'reason' }) },
    {
      label: 'AbortSignal.timeout(1) reason',
      getReason: async () => {
        const signal = AbortSignal.timeout(1);
        await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
        return signal.reason;
      },
    },
    { label: "DOMException('', 'TimeoutError')", getReason: () => new DOMException('', 'TimeoutError') },
    { label: 'canc TimeoutError', getReason: () => new TimeoutError() },
    { label: "foreign {name: 'TimeoutError'}", getReason: () => ({ name: 'TimeoutError' }) },
    { label: 'CancelError', getReason: () => new CancelError('existing cancel') },
    {
      label: 'brand-only timeout error',
      getReason: () => {
        class CustomBrandedTimeout extends Error {
          name = 'CustomTimeout';
          constructor() {
            super();
            Object.setPrototypeOf(this, new.target.prototype);
          }
        }
        Object.defineProperty(CustomBrandedTimeout.prototype, TIMEOUT_ERROR_BRAND, { value: true });
        return new CustomBrandedTimeout();
      },
    },
  ];

  describe('equality table against core CancelablePromise.cancel(reason)', () => {
    for (const { label, getReason } of tableCases) {
      it(`matches core cancel(reason) on ${label}`, async () => {
        const reason = await getReason();

        const promise = new CancelablePromise(() => {});
        promise.cancel(reason);
        let coreError!: CancelError;
        try {
          await promise;
        } catch (error) {
          coreError = error as CancelError;
        }

        const helperError = toCancelError(reason, CancelError);

        expect(helperError.message).toBe(coreError.message);
        expect('cause' in helperError).toBe('cause' in coreError);
        expect(helperError.cause).toBe(coreError.cause);
        expect(helperError.timedOut).toBe(coreError.timedOut);
        expect(helperError.aborted).toBe(coreError.aborted);
        expect(Object.keys(helperError)).toEqual(Object.keys(coreError));
      });
    }
  });

  describe('additional normalization behaviors', () => {
    it('passes through CancelError verbatim with same identity', () => {
      const original = new CancelError('user cancel');
      const normalized = toCancelError(original, CancelError);
      expect(normalized).toBe(original);
    });

    it('works with toCancelErrorFactory providing prebound normalizer', () => {
      const normalize = toCancelErrorFactory({ CancelError });
      const foreignTimeout = { name: 'TimeoutError' };

      const normalized = normalize(foreignTimeout);

      expect(normalized).toBeInstanceOf(CancelError);
      expect(normalized.timedOut).toBe(true);
      expect(normalized.cause).toBe(foreignTimeout);
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
