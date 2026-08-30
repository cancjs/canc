import * as fs from 'node:fs';

import {
  EACCES,
  ENOENT,
  isBusyError,
  isCrossDeviceError,
  isErrno,
  isExistsError,
  isIsDirError,
  isNoSpaceError,
  isNotDirError,
  isNotEmptyError,
  isNotFoundError,
  isPermissionError,
  isTooManyFilesError,
} from './errno';

describe('errno failure types and guards', () => {
  describe('isErrno helper', () => {
    const isCustom = isErrno('ECUSTOM');

    it('matches an object with the expected code', () => {
      expect(isCustom({ code: 'ECUSTOM' })).toBe(true);
    });

    it('rejects an object with a different code', () => {
      expect(isCustom({ code: 'OTHER' })).toBe(false);
    });

    it('rejects non-object and null values', () => {
      expect(isCustom(null)).toBe(false);
      expect(isCustom(undefined)).toBe(false);
      expect(isCustom('ECUSTOM')).toBe(false);
      expect(isCustom(123)).toBe(false);
      expect(isCustom({})).toBe(false);
    });
  });

  describe('isNotFoundError', () => {
    it('matches a real ENOENT error from fs.promises.stat', async () => {
      let caught: unknown;
      try {
        await fs.promises.stat('/canc-non-existent-path-probe-404');
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      expect(isNotFoundError(caught)).toBe(true);
    });

    it('rejects an error with a different code', () => {
      expect(isNotFoundError({ code: 'EACCES' })).toBe(false);
    });
  });

  describe('isPermissionError', () => {
    it('matches EACCES, EPERM, and EROFS codes', () => {
      expect(isPermissionError({ code: 'EACCES' })).toBe(true);
      expect(isPermissionError({ code: 'EPERM' })).toBe(true);
      expect(isPermissionError({ code: 'EROFS' })).toBe(true);
    });

    it('matches NotCapable error name without code', () => {
      expect(isPermissionError({ name: 'NotCapable' })).toBe(true);
    });

    it('does not key on errno number', () => {
      expect(isPermissionError({ errno: -4058 })).toBe(false);
    });

    it('rejects unrelated errors and primitives', () => {
      expect(isPermissionError({ code: 'ENOENT' })).toBe(false);
      expect(isPermissionError(null)).toBe(false);
      expect(isPermissionError(undefined)).toBe(false);
      expect(isPermissionError('EACCES')).toBe(false);
    });
  });

  describe('single-code guards', () => {
    it('matches isExistsError for EEXIST only', () => {
      expect(isExistsError({ code: 'EEXIST' })).toBe(true);
      expect(isExistsError({ code: 'ENOENT' })).toBe(false);
    });

    it('matches isIsDirError for EISDIR only', () => {
      expect(isIsDirError({ code: 'EISDIR' })).toBe(true);
      expect(isIsDirError({ code: 'ENOTDIR' })).toBe(false);
    });

    it('matches isNotDirError for ENOTDIR only', () => {
      expect(isNotDirError({ code: 'ENOTDIR' })).toBe(true);
      expect(isNotDirError({ code: 'EISDIR' })).toBe(false);
    });

    it('matches isNotEmptyError for ENOTEMPTY only', () => {
      expect(isNotEmptyError({ code: 'ENOTEMPTY' })).toBe(true);
      expect(isNotEmptyError({ code: 'ENOENT' })).toBe(false);
    });

    it('matches isCrossDeviceError for EXDEV only', () => {
      expect(isCrossDeviceError({ code: 'EXDEV' })).toBe(true);
      expect(isCrossDeviceError({ code: 'EBUSY' })).toBe(false);
    });
  });

  describe('multi-code union guards', () => {
    it('matches isBusyError for EBUSY and EAGAIN', () => {
      expect(isBusyError({ code: 'EBUSY' })).toBe(true);
      expect(isBusyError({ code: 'EAGAIN' })).toBe(true);
      expect(isBusyError({ code: 'ENOENT' })).toBe(false);
      expect(isBusyError(null)).toBe(false);
    });

    it('matches isNoSpaceError for ENOSPC and EDQUOT', () => {
      expect(isNoSpaceError({ code: 'ENOSPC' })).toBe(true);
      expect(isNoSpaceError({ code: 'EDQUOT' })).toBe(true);
      expect(isNoSpaceError({ code: 'ENOENT' })).toBe(false);
      expect(isNoSpaceError(null)).toBe(false);
    });

    it('matches isTooManyFilesError for EMFILE and ENFILE', () => {
      expect(isTooManyFilesError({ code: 'EMFILE' })).toBe(true);
      expect(isTooManyFilesError({ code: 'ENFILE' })).toBe(true);
      expect(isTooManyFilesError({ code: 'ENOENT' })).toBe(false);
      expect(isTooManyFilesError(null)).toBe(false);
    });
  });

  describe('type discriminant', () => {
    it('preserves code discriminant under Exclude', () => {
      type Rest = Exclude<ENOENT | EACCES, ENOENT>;
      const rest: Rest = null as unknown as EACCES;
      expect(rest).toBeNull();
    });
  });
});
