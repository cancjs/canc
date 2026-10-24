import { CancelError } from '@cancjs/promise';
import * as fs from 'fs';
import * as path from 'path';

import { cancelHeadersOf, cancelStatusOf, hasClientLeft, isResponseLive } from './exchange';
import { createShutdownError, createTimeoutError } from './timeout';

const DISCONNECT_PREDICATE = '!res.writableEnded && (res.destroyed || !res.writable)';

describe('exchange', () => {
  describe('cancelStatusOf', () => {
    it('keeps the stamped status of a deadline over the handler status option', () => {
      const deadline = createTimeoutError({ ms: 100, message: 'late', status: 504 });

      expect(cancelStatusOf(deadline, 418)).toBe(504);
    });

    it('applies the handler status option to a shutdown cancellation', () => {
      expect(cancelStatusOf(createShutdownError('closing'), 418)).toBe(418);
    });

    it('applies the handler status option to a user timeout that carries no stamp', () => {
      const userTimeout = createTimeoutError({ ms: 100, message: 'late', status: 504 });
      delete (userTimeout as { status?: number }).status;
      delete (userTimeout as { statusCode?: number }).statusCode;

      expect(cancelStatusOf(userTimeout, 418)).toBe(418);
    });

    it('lets the handler status option beat a status the caller stamped on its own cancellation', () => {
      const own = Object.assign(new CancelError('own'), { status: 499 });

      expect(cancelStatusOf(own, 502)).toBe(502);
    });

    it('answers 503 for a shutdown cancellation when no option is set', () => {
      expect(cancelStatusOf(createShutdownError('closing'), undefined)).toBe(503);
    });

    // precedence: deadline, explicit shutdown status, handler option, 503
    it.each<[string, CancelError, number | undefined, number]>([
      [
        'a deadline keeps its stamp over the option',
        createTimeoutError({ ms: 100, message: 'late', status: 504 }),
        502,
        504,
      ],
      ['a default shutdown takes the option', createShutdownError('closing'), 502, 502],
      ['an explicit shutdown status beats the option', createShutdownError('closing', { status: 504 }), 502, 504],
      [
        'an explicit shutdown status answers without an option',
        createShutdownError('closing', { status: 504 }),
        undefined,
        504,
      ],
      ['a route-signal cancel takes the option', new CancelError('aborted'), 502, 502],
      ['a route-signal cancel answers 503 without an option', new CancelError('aborted'), undefined, 503],
    ])('%s', (_name, error, option, status) => {
      expect(cancelStatusOf(error, option)).toBe(status);
    });

    it('copies the shutdown headers and gives other cancellations none', () => {
      const headers = { 'Retry-After': '5' };
      const shutdown = createShutdownError('closing', { headers });
      headers['Retry-After'] = '30';

      expect(cancelHeadersOf(shutdown)).toEqual({ 'Retry-After': '5' });
      expect(cancelHeadersOf(createShutdownError('closing'))).toBeUndefined();
      expect(cancelHeadersOf(createTimeoutError({ ms: 100, message: 'late', status: 504 }))).toBeUndefined();
    });
  });

  describe('isResponseLive', () => {
    it('returns true when writableEnded is false, destroyed is false, and writable is true', () => {
      expect(isResponseLive({ writableEnded: false, destroyed: false, writable: true })).toBe(true);
      expect(isResponseLive({ writableEnded: false, destroyed: false })).toBe(true);
    });

    it('returns false when writableEnded is true', () => {
      expect(isResponseLive({ writableEnded: true, destroyed: false, writable: true })).toBe(false);
    });

    it('returns false when destroyed is true', () => {
      expect(isResponseLive({ writableEnded: false, destroyed: true, writable: true })).toBe(false);
    });

    it('returns false when writable is false', () => {
      expect(isResponseLive({ writableEnded: false, destroyed: false, writable: false })).toBe(false);
    });
  });

  describe('hasClientLeft', () => {
    it('returns false when writableEnded is true, even if destroyed is true', () => {
      expect(hasClientLeft({ writableEnded: true, destroyed: true, writable: true })).toBe(false);
    });

    it('returns true when writableEnded is false and destroyed is true', () => {
      expect(hasClientLeft({ writableEnded: false, destroyed: true, writable: true })).toBe(true);
    });

    it('returns true when writableEnded is false and writable is false', () => {
      expect(hasClientLeft({ writableEnded: false, destroyed: false, writable: false })).toBe(true);
    });

    it('returns false when writableEnded is false, destroyed is false, and writable is true', () => {
      expect(hasClientLeft({ writableEnded: false, destroyed: false, writable: true })).toBe(false);
    });
  });

  describe('README disconnect recipe', () => {
    it('matches the shipped predicate in node and express READMEs', () => {
      const readmePaths = [
        path.resolve(__dirname, '../canc-server/canc-server-node/README.md'),
        path.resolve(__dirname, '../canc-server/canc-server-express/README.md'),
      ];
      const missing = readmePaths.filter(
        (filePath) => !fs.readFileSync(filePath, 'utf8').includes(DISCONNECT_PREDICATE),
      );
      expect(missing).toEqual([]);
    });
  });
});
