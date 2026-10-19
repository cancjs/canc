import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { zipFilesCheckpointed } from './extra';

// synthetic archive in place of node's zip writer, which no tracked runtime ships yet (see ./types.ts):
// the spec exercises the walk, the entry order and the close, not the bytes the real writer produces
const mockArchive = {
  addEntry: jest.fn(),
  close: jest.fn(),
};

jest.mock('./index', () => ({
  createZipArchive: jest.fn(() => mockArchive),
}));

describe('@cancjs/node/zlib/extra', () => {
  beforeEach(() => {
    mockArchive.addEntry.mockReset();
    mockArchive.close.mockReset();
  });

  it('adds every entry in order and closes the archive once', async () => {
    await zipFilesCheckpointed(['a.txt', 'b.txt'], 'out.zip');

    expect(mockArchive.addEntry.mock.calls).toEqual([['a.txt'], ['b.txt']]);
    expect(mockArchive.close).toHaveBeenCalledTimes(1);
  });

  it('stops at a file boundary on cancel and still closes the archive', async () => {
    const files = ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt'];
    const written: string[] = [];

    // cancel fires from inside the second entry's own step, deterministically, rather than racing the
    // walk on a timer: `promise` is assigned before the walk reaches index 1, since index 0 runs
    // synchronously inside the executor and everything after that is a later microtask turn
    // eslint-disable-next-line prefer-const -- the addEntry mock below captures promise before it exists
    let promise!: CancelablePromise<void, unknown>;
    mockArchive.addEntry.mockImplementation((file: string) => {
      written.push(file);
      if (file === 'b.txt') {
        promise.cancel('stop mid-list');
      }
    });

    promise = zipFilesCheckpointed(files, 'out.zip');

    const reason = await promise.catch((err: unknown) => err);
    expect(isCancelError(reason)).toBe(true);

    // partial, no rollback: the entries written before the checkpoint noticed cancel stay in the archive
    expect(written).toEqual(['a.txt', 'b.txt']);
    expect(mockArchive.close).toHaveBeenCalledTimes(1);
  });
});
