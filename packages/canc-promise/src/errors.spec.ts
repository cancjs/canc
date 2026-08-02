import {
  ABORT_ERROR_BRAND,
  AbortError,
  AGGREGATE_ERROR_BRAND,
  AggregateError,
  createAggregateError,
  createErrorClass,
  isAbortError,
  isAggregateError,
  isTimeoutError,
  TIMEOUT_ERROR_BRAND,
  TimeoutError,
} from '../../_util';

const platformDomException = (globalThis as unknown as { DOMException?: new (...args: any[]) => object }).DOMException;

describe('shared error classes', () => {
  describe('AbortError', () => {
    it('carries its name and default message', () => {
      const error = new AbortError();

      expect(error.name).toBe('AbortError');
      expect(error.message).toBe('The operation was aborted');
    });

    it('takes an explicit message', () => {
      expect(new AbortError('custom').message).toBe('custom');
    });

    it('keeps an explicitly empty message empty', () => {
      expect(new AbortError('').message).toBe('');
    });

    it('is an instance of its own class', () => {
      expect(new AbortError()).toBeInstanceOf(AbortError);
    });

    it('is an instance of the class it is built on', () => {
      if (!platformDomException) {
        expect(new AbortError()).toBeInstanceOf(Error);
        return;
      }

      expect(new AbortError()).toBeInstanceOf(platformDomException);
    });

    it('carries the brand on the prototype', () => {
      const prototype = AbortError.prototype as unknown as Record<symbol, unknown>;

      expect(prototype[Symbol.for('@cancjs/promise:AbortError')]).toBe(true);
      expect(prototype[ABORT_ERROR_BRAND]).toBe(true);
      expect(Object.getOwnPropertySymbols(new AbortError())).not.toContain(ABORT_ERROR_BRAND);
    });

    it('reports a useful string tag', () => {
      expect(Object.prototype.toString.call(new AbortError())).toBe('[object AbortError]');
    });
  });

  describe('TimeoutError', () => {
    it('carries its name and default message', () => {
      const error = new TimeoutError();

      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('The operation was aborted due to timeout');
    });

    it('takes an explicit message', () => {
      expect(new TimeoutError('custom').message).toBe('custom');
    });

    it('keeps an explicitly empty message empty', () => {
      expect(new TimeoutError('').message).toBe('');
    });

    it('is an instance of its own class', () => {
      expect(new TimeoutError()).toBeInstanceOf(TimeoutError);
    });

    it('is an instance of the class it is built on', () => {
      if (!platformDomException) {
        expect(new TimeoutError()).toBeInstanceOf(Error);
        return;
      }

      expect(new TimeoutError()).toBeInstanceOf(platformDomException);
    });

    it('carries the brand on the prototype', () => {
      const prototype = TimeoutError.prototype as unknown as Record<symbol, unknown>;

      expect(prototype[Symbol.for('@cancjs/promise:TimeoutError')]).toBe(true);
      expect(prototype[TIMEOUT_ERROR_BRAND]).toBe(true);
    });
  });

  describe('createErrorClass', () => {
    it('names the class it builds', () => {
      const RetryError = createErrorClass('RetryError');

      expect(RetryError.name).toBe('RetryError');
      expect(new RetryError().name).toBe('RetryError');
    });

    it('leaves the message empty when no default is given', () => {
      const RetryError = createErrorClass('RetryError');

      expect(new RetryError().message).toBe('');
    });

    it('keeps instanceof working through a subclass', () => {
      const RetryError = createErrorClass('RetryError');

      class HttpRetryError extends RetryError {}

      const error = new HttpRetryError('nope');

      expect(error).toBeInstanceOf(HttpRetryError);
      expect(error).toBeInstanceOf(RetryError);
      expect(error.message).toBe('nope');
    });
  });
});

describe('shared error guards', () => {
  it('matches its own class', () => {
    expect(isAbortError(new AbortError())).toBe(true);
    expect(isTimeoutError(new TimeoutError())).toBe(true);
  });

  it('matches a brand carrier whose name says something else', () => {
    expect(isAbortError({ [ABORT_ERROR_BRAND]: true, name: 'Whatever' })).toBe(true);
    expect(isTimeoutError({ [TIMEOUT_ERROR_BRAND]: true, name: 'Whatever' })).toBe(true);
  });

  it('matches a platform error by name alone', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isTimeoutError({ name: 'TimeoutError' })).toBe(true);
  });

  it('does not inspect the message', () => {
    expect(isTimeoutError({ name: 'TimeoutError' })).toBe(true);
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
  });

  it('does not match another kind of error', () => {
    expect(isAbortError(new TimeoutError())).toBe(false);
    expect(isTimeoutError(new AbortError())).toBe(false);
    expect(isAbortError(new Error('boom'))).toBe(false);
    expect(isTimeoutError(new Error('boom'))).toBe(false);
  });

  it('does not match a non-object', () => {
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
  });
});

describe('AggregateError', () => {
  it('builds an error carrying the collected reasons', () => {
    const reasons = [new Error('a'), new Error('b')];
    const error = createAggregateError(reasons, 'all failed');

    expect(error.name).toBe('AggregateError');
    expect(error.message).toBe('all failed');
    expect(error.errors).toEqual(reasons);
    expect(error).toBeInstanceOf(Error);
  });

  it('is built through the exported class', () => {
    expect(createAggregateError([])).toBeInstanceOf(AggregateError);
  });

  it('is matched by its guard', () => {
    expect(isAggregateError(createAggregateError([]))).toBe(true);
    expect(isAggregateError({ name: 'AggregateError' })).toBe(true);
    expect(isAggregateError({ [AGGREGATE_ERROR_BRAND]: true, name: 'Whatever' })).toBe(true);
    expect(isAggregateError(new Error('boom'))).toBe(false);
  });
});
