import { isNotImplementedError } from './errors/classes';

describe('version simulation', () => {
  it('does not throw when importing missing features and correctly handles rejections/throws', async () => {
    let importedCrypto: any;
    let importedZlib: any;
    let importedFs: any;

    await jest.isolateModulesAsync(async () => {
      // Mock node modules
      const mockModule = (names: string[]) => {
        const mod: any = {};
        for (const name of names) {
          mod[name] = () => {};
        }
        return mod;
      };

      jest.doMock('node:crypto', () => ({
        ...mockModule([
          'pbkdf2',
          'scrypt',
          'generateKeyPair',
          'generateKey',
          'generatePrime',
          'checkPrime',
          'hkdf',
          'randomBytes',
          'randomFill',
        ]),
        // no argon2, encapsulate, decapsulate
      }));

      jest.doMock('node:zlib', () => ({
        ...mockModule([
          'brotliCompress',
          'brotliDecompress',
          'deflate',
          'deflateRaw',
          'gzip',
          'gunzip',
          'inflate',
          'inflateRaw',
          'unzip',
          'constants',
        ]),
        // missing compressGzip, etc.
      }));

      jest.doMock('node:fs', () => ({
        ...mockModule(['Dir', 'Dirent', 'Stats', 'exists']),
        promises: {
          constants: {},
        },
      }));

      jest.doMock('node:fs/promises', () => ({
        ...mockModule([
          'access',
          'appendFile',
          'chmod',
          'chown',
          'copyFile',
          'cp',
          'lchmod',
          'lchown',
          'link',
          'lstat',
          'lutimes',
          'mkdir',
          'mkdtemp',
          'open',
          'opendir',
          'readFile',
          'readdir',
          'readlink',
          'realpath',
          'rename',
          'rm',
          'rmdir',
          'stat',
          'symlink',
          'truncate',
          'unlink',
          'utimes',
          'watch',
          'writeFile',
        ]),
        constants: {},
      }));

      jest.doMock('node:stream/consumers', () => ({
        ...mockModule(['text', 'json', 'buffer', 'arrayBuffer', 'blob']),
        // no bytes
      }));

      jest.doMock('node:worker_threads', () => ({
        // no locks
      }));

      // we must also mock the internal features to pretend we are on an old node
      jest.doMock('./features', () => ({
        features: {
          hasGlob: false,
          hasMkdtempDisposable: false,
          hasStatfs: false,
          hasConsumersBytes: false,
          hasWorkerLocks: false,
          nodeVersion: '14.0.0',
          nodeMajor: 14,
        },
      }));

      importedCrypto = require('./crypto/index');
      importedZlib = require('./zlib/index');
      importedFs = require('./fs/index');
    });

    expect(importedCrypto).toBeDefined();
    expect(importedZlib).toBeDefined();
    expect(importedFs).toBeDefined();

    // Promise-kind functions reject with NotImplementedError having feature and required properties
    let pErr: unknown;
    try {
      await importedCrypto.argon2();
    } catch (e: unknown) {
      pErr = e;
    }
    expect(isNotImplementedError(pErr)).toBe(true);
    expect(pErr).toMatchObject({ feature: 'argon2', required: '24' });

    let zErr: unknown;
    try {
      await importedZlib.zstdCompress(Buffer.from('a'));
    } catch (e: unknown) {
      zErr = e;
    }
    expect(isNotImplementedError(zErr)).toBe(true);
    expect(zErr).toMatchObject({ feature: 'zstdCompress', required: '22' });

    // Sync-kind functions throw NotImplementedError having feature and required properties
    let cErr: unknown;
    try {
      importedZlib.crc32(Buffer.from('a'));
    } catch (e: unknown) {
      cErr = e;
    }
    expect(isNotImplementedError(cErr)).toBe(true);
    expect(cErr).toMatchObject({ feature: 'crc32', required: '22' });

    let fErr: unknown;
    try {
      importedFs.glob('*.js');
    } catch (e: unknown) {
      fErr = e;
    }
    expect(isNotImplementedError(fErr)).toBe(true);
    expect(fErr).toMatchObject({ feature: 'glob', required: '22' });
  });
});
