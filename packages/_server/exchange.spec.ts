import * as fs from 'fs';
import * as path from 'path';

import { hasClientLeft, isResponseLive } from './exchange';

const DISCONNECT_PREDICATE = '!res.writableEnded && (res.destroyed || !res.writable)';

describe('exchange', () => {
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
