import * as fs from 'fs';
import * as path from 'path';

import { cancelStatusOf, hasClientLeft, isResponseLive } from './exchange';
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

    it('answers 503 for a shutdown cancellation when no option is set', () => {
      expect(cancelStatusOf(createShutdownError('closing'), undefined)).toBe(503);
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
