import * as fs from 'node:fs';

import { resetFs, setFs } from './registry';
import * as sync from './sync';

describe('sync', () => {
  afterEach(() => {
    resetFs();
  });

  it('exports all 46 names', () => {
    const expected = [
      'accessSync',
      'appendFileSync',
      'chmodSync',
      'chownSync',
      'closeSync',
      'copyFileSync',
      'cpSync',
      'existsSync',
      'fchmodSync',
      'fchownSync',
      'fdatasyncSync',
      'fstatSync',
      'fsyncSync',
      'ftruncateSync',
      'futimesSync',
      'lchmodSync',
      'lchownSync',
      'linkSync',
      'lstatSync',
      'lutimesSync',
      'mkdirSync',
      'mkdtempSync',
      'openSync',
      'opendirSync',
      'readFileSync',
      'readdirSync',
      'readlinkSync',
      'readSync',
      'readvSync',
      'realpathSync',
      'renameSync',
      'rmSync',
      'rmdirSync',
      'statSync',
      'statfsSync',
      'symlinkSync',
      'truncateSync',
      'unlinkSync',
      'utimesSync',
      'writeFileSync',
      'writeSync',
      'writevSync',
      'Dirent',
      'Dir',
      'Stats',
      'constants',
    ];
    const exports = Object.keys(sync);
    expect(exports.sort()).toEqual(expected.sort());
  });

  it('routes to getFs()', () => {
    const fake = {
      readFileSync: jest.fn().mockReturnValue('fake-data'),
    };
    setFs(fake);
    const res = sync.readFileSync('test.txt');
    expect(fake.readFileSync).toHaveBeenCalledWith('test.txt');
    expect(res).toBe('fake-data');
  });

  it('returns byte-identical values for real file', () => {
    const data = fs.readFileSync(__filename);
    const res = sync.readFileSync(__filename);
    expect(res).toEqual(data);
  });
});
