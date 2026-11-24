import { isCancelError, TimeoutError } from '@cancjs/promise';

import { HANDLER_TIMEOUT } from './reasons';
import {
  checkCancelHeaders,
  checkTimeoutOptions,
  createShutdownError,
  createTimeoutError,
  DEFAULT_TIMEOUT_STATUS,
  MAX_TIMER_MS,
  normalizeTimeout,
} from './timeout';

describe('timeout option validation', () => {
  it.each([
    [{ 'Bad Name': 'ok' }],
    [{ 'X-Test': 'bad\rvalue' }],
    [{ 'X-Test': 'bad\nvalue' }],
    [{ 'X-Test': 1 }],
    [null],
    [[]],
    ['not a record'],
  ])('rejects invalid headers even for an unusable duration: %j', (headers) => {
    expect(() => checkCancelHeaders(headers as never)).toThrow(TypeError);
    expect(() => normalizeTimeout({ ms: Infinity, headers: headers as never })).toThrow(TypeError);
  });

  it('accepts valid RFC token names, values and numeric or absent deadlines', () => {
    expect(() => checkCancelHeaders({ 'X-`Token': 'ok', 'Retry-After': '1' })).not.toThrow();
    expect(() => checkTimeoutOptions()).not.toThrow();
    expect(() => checkTimeoutOptions(1)).not.toThrow();
    expect(() => checkTimeoutOptions({ ms: Infinity, status: 599 })).not.toThrow();
  });

  it.each([199, 600, NaN, Infinity, 200.5])('rejects invalid status %s', (status) => {
    expect(() => normalizeTimeout({ ms: -1, status })).toThrow(RangeError);
  });
});

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

  it('keeps the deadline diagnostic in a direct TimeoutError cause', () => {
    const error = createTimeoutError({ message: HANDLER_TIMEOUT, ms: 1, status: 503 });

    expect(isCancelError(error)).toBe(true);
    expect(error.timedOut).toBe(true);
    expect(error.message).toBe('Request canceled');
    expect(error.stack?.split('\n')[0]).toBe('CancelError: Request canceled');
    expect(error.cause).toBeInstanceOf(TimeoutError);
    expect(error.cause).toMatchObject({ message: HANDLER_TIMEOUT });
    expect(Object.getOwnPropertyDescriptor(error, 'cause')).toMatchObject({ enumerable: false, value: error.cause });
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

  it('keeps the shutdown diagnostic in a direct native Error cause', () => {
    const error = createShutdownError('closing');

    expect(isCancelError(error)).toBe(true);
    expect(error).toMatchObject({
      expose: false,
      message: 'Request canceled',
      status: 503,
      statusCode: 503,
      timedOut: false,
    });
    expect(error.stack?.split('\n')[0]).toBe('CancelError: Request canceled');
    expect(Object.getPrototypeOf(error.cause)).toBe(Error.prototype);
    expect(error.cause).toMatchObject({ message: 'closing' });
    expect(Object.getOwnPropertyDescriptor(error, 'cause')).toMatchObject({ enumerable: false, value: error.cause });
  });
});
