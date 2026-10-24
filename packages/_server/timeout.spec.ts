import { isCancelError } from '@cancjs/promise';

import { HANDLER_TIMEOUT } from './reasons';
import {
  createShutdownError,
  createTimeoutError,
  DEFAULT_TIMEOUT_STATUS,
  MAX_TIMER_MS,
  normalizeTimeout,
} from './timeout';

describe('handler deadline', () => {
  it('reads a number as the millisecond shorthand', () => {
    expect(normalizeTimeout(30_000)).toEqual({
      message: HANDLER_TIMEOUT,
      ms: 30_000,
      status: DEFAULT_TIMEOUT_STATUS,
    });
  });

  it('defaults the status to 503', () => {
    expect(normalizeTimeout(1)?.status).toBe(503);
  });

  it('takes the status and message from the object form', () => {
    expect(normalizeTimeout({ message: 'took too long', ms: 30_000, status: 504 })).toEqual({
      message: 'took too long',
      ms: 30_000,
      status: 504,
    });
  });

  it('fills the object form defaults in', () => {
    expect(normalizeTimeout({ ms: 5 })).toEqual({
      message: HANDLER_TIMEOUT,
      ms: 5,
      status: DEFAULT_TIMEOUT_STATUS,
    });
  });

  it('has no deadline without an option', () => {
    expect(normalizeTimeout()).toBeUndefined();
    expect(normalizeTimeout(undefined)).toBeUndefined();
  });

  it('treats an unusable duration as no deadline', () => {
    expect(normalizeTimeout(Infinity)).toBeUndefined();
    expect(normalizeTimeout(-1)).toBeUndefined();
    expect(normalizeTimeout(NaN)).toBeUndefined();
    expect(normalizeTimeout({ ms: Infinity })).toBeUndefined();
  });

  it('clamps a duration past the timer ceiling instead of letting it wrap', () => {
    expect(normalizeTimeout(2 ** 31)?.ms).toBe(MAX_TIMER_MS);
    expect(normalizeTimeout({ ms: Number.MAX_SAFE_INTEGER })?.ms).toBe(MAX_TIMER_MS);
    expect(normalizeTimeout(MAX_TIMER_MS)?.ms).toBe(MAX_TIMER_MS);
  });

  it('keeps zero as an immediate deadline', () => {
    expect(normalizeTimeout(0)?.ms).toBe(0);
  });

  it('stamps the status a framework error handler reads', () => {
    const error = createTimeoutError({ message: HANDLER_TIMEOUT, ms: 1, status: 504 });

    expect(error.status).toBe(504);
    expect(error.statusCode).toBe(504);
  });

  it('mints a cancellation that reports itself as a timeout', () => {
    const error = createTimeoutError({ message: HANDLER_TIMEOUT, ms: 1, status: 503 });

    expect(isCancelError(error)).toBe(true);
    expect(error.timedOut).toBe(true);
    expect(error.message).toBe(HANDLER_TIMEOUT);
  });
});

describe('deadline and shutdown errors', () => {
  it('copies the headers the timeout option names onto the error', () => {
    const headers = { 'Retry-After': '5' };
    const error = createTimeoutError(normalizeTimeout({ headers, ms: 30 })!);

    headers['Retry-After'] = '30';

    expect(error.headers).toEqual({ 'Retry-After': '5' });
  });

  it('marks a deadline error as not exposed', () => {
    expect(createTimeoutError(normalizeTimeout(30)!).expose).toBe(false);
  });

  it('marks a shutdown error as not exposed', () => {
    expect(createShutdownError('closing').expose).toBe(false);
  });
});
