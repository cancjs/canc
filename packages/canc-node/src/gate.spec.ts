import { CancelablePromise } from '@cancjs/promise';

import { isNotImplementedError, NotImplementedError } from './errors/classes';
import { gated } from './gate';

describe('gated', () => {
  it('returns factory result eagerly when available', () => {
    let callCount = 0;
    const fn = (a: number, b: number): number => a + b;
    const factory = () => {
      callCount++;
      return fn;
    };

    const result = gated(true, 'x', 'v22', factory);

    expect(callCount).toBe(1);
    expect(result).toBe(fn);
    expect(result(2, 3)).toBe(5);
    expect(callCount).toBe(1);
  });

  it('throws NotImplementedError for sync when not available without calling factory', () => {
    let callCount = 0;
    const factory = () => {
      callCount++;
      return () => 'ok';
    };
    const wrapped = gated(false, 'glob', 'v22.0.0', factory, 'sync');

    let thrownError: unknown;
    try {
      wrapped();
    } catch (err) {
      thrownError = err;
    }

    expect(callCount).toBe(0);
    expect(thrownError).toBeInstanceOf(NotImplementedError);
    expect(isNotImplementedError(thrownError)).toBe(true);

    const message = (thrownError as NotImplementedError).message;
    expect(message).toContain('glob');
    expect(message).toContain('22');

    const notImpl = thrownError as NotImplementedError;
    expect(notImpl.feature).toBe('glob');
    expect(notImpl.required).toBe('v22.0.0');
  });

  it('rejects NotImplementedError for promise when not available without calling factory', async () => {
    let callCount = 0;
    const factory = () => {
      callCount++;
      return () => CancelablePromise.resolve('ok');
    };
    const wrapped = gated(false, 'argon2', 'v24.0.0', factory, 'promise');

    let thrownError: unknown;
    try {
      await wrapped();
    } catch (err) {
      thrownError = err;
    }

    expect(callCount).toBe(0);
    expect(thrownError).toBeInstanceOf(NotImplementedError);
    expect(isNotImplementedError(thrownError)).toBe(true);

    const message = (thrownError as NotImplementedError).message;
    expect(message).toContain('argon2');
    expect(message).toContain('24');

    const notImpl = thrownError as NotImplementedError;
    expect(notImpl.feature).toBe('argon2');
    expect(notImpl.required).toBe('v24.0.0');
  });
});
