import { isNotImplementedError, NotImplementedError } from './errors/classes';
import { gated } from './gate';

describe('gated', () => {
  it('returns original function reference when available', () => {
    const fn = (a: number, b: number): number => a + b;
    const result = gated(true, 'x', 'v22', fn);

    expect(result).toBe(fn);
    expect(result(2, 3)).toBe(5);
  });

  it('returns a throwing function when not available', () => {
    const fn = (): string => 'ok';
    const wrapped = gated(false, 'glob', 'v22.0.0', fn);

    expect(wrapped).not.toBe(fn);

    let thrownError: unknown;
    try {
      wrapped();
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(NotImplementedError);
    expect(isNotImplementedError(thrownError)).toBe(true);

    const message = (thrownError as NotImplementedError).message;
    expect(message).toContain('glob');
    expect(message).toContain('22');

    const notImpl = thrownError as NotImplementedError;
    expect(notImpl.feature).toBe('glob');
    expect(notImpl.required).toBe('v22.0.0');
  });
});
