import { Readable } from 'node:stream';

import { createZipArchive, zipFiles } from './index';

// stub shaped like node 26.8 zipFiles: sync, [sourcePath, entryName] pairs in, Readable out
jest.mock('node:zlib', () => {
  const { Readable: StubReadable } = jest.requireActual('node:stream');
  const actual = jest.requireActual('node:zlib');
  const stubZipFiles = (files: Iterable<readonly [string, string]>) => {
    const names = [...files].map(([, entryName]) => entryName);
    return new StubReadable({
      objectMode: true,
      read() {
        for (const name of names) {
          this.push(Buffer.from(name));
        }
        this.push(null);
      },
    });
  };
  const stubCreateZipArchive = (entries: Iterable<unknown>, options?: unknown) => {
    void options;
    return new StubReadable({
      read() {
        this.push(Buffer.from(String([...entries].length)));
        this.push(null);
      },
    });
  };
  const stubs = { zipFiles: stubZipFiles, createZipArchive: stubCreateZipArchive };
  return { __esModule: true, ...actual, default: { ...actual, ...stubs }, ...stubs };
});

describe('zipFiles mirrors node 26.8 zipFiles', () => {
  it("returns node's Readable synchronously rather than a promise", () => {
    const result = zipFiles([['/src/a.txt', 'a.txt']]);

    expect(result).toBeInstanceOf(Readable);
    expect(typeof (result as unknown as { then?: unknown }).then).toBe('undefined');
    result.destroy();
  });

  it('yields the bytes node produces for the entries it was given', async () => {
    const chunks: string[] = [];
    for await (const chunk of zipFiles([
      ['/src/a.txt', 'a.txt'],
      ['/src/b.txt', 'docs/b.txt'],
    ])) {
      chunks.push(String(chunk));
    }

    expect(chunks).toEqual(['a.txt', 'docs/b.txt']);
  });

  it('cancel is destroying the returned stream', async () => {
    const result = zipFiles([['/src/a.txt', 'a.txt']]);

    result.destroy();

    expect(result.destroyed).toBe(true);
  });

  it('createZipArchive takes entries and options, returns a Readable, no fd or addEntry', () => {
    const result = createZipArchive([{ name: 'a.txt' }], { comment: 'c', baseOffset: 0 });

    expect(result).toBeInstanceOf(Readable);
    expect(typeof (result as unknown as { addEntry?: unknown }).addEntry).toBe('undefined');
    result.destroy();
  });
});
