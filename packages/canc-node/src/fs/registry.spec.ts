import nodeFs from 'node:fs';

import { getFs, getFsOptions, IFsLike, resetFs, setFs } from './registry';

describe('fs registry', () => {
  afterEach(() => {
    resetFs();
  });

  it('returns node:fs identity by default before any setFs call', () => {
    expect(getFs()).toBe(nodeFs);
  });

  it('defaults retryOpen option to false', () => {
    expect(getFsOptions().retryOpen).toBe(false);
  });

  it('registers a custom fs implementation', () => {
    const fakeFs: IFsLike = {
      readFile: jest.fn(),
      readFileSync: jest.fn(),
    };

    setFs(fakeFs);
    expect(getFs()).toBe(fakeFs);
  });

  it('leaves retryOpen as false when setFs is called without options', () => {
    const fakeFs: IFsLike = {
      readFile: jest.fn(),
    };

    setFs(fakeFs);
    expect(getFsOptions().retryOpen).toBe(false);
  });

  it('leaves retryOpen as false when setFs is called with empty options', () => {
    const fakeFs: IFsLike = {
      readFile: jest.fn(),
    };

    setFs(fakeFs, {});
    expect(getFsOptions().retryOpen).toBe(false);
  });

  it('rejects an empty object at compile time', () => {
    // @ts-expect-error empty fs implementation is not allowed
    setFs({});
  });

  it('accepts and routes a partial mock', () => {
    const mockReadFile = jest.fn();
    const mockOpen = jest.fn();
    const partialMock: IFsLike = {
      readFile: mockReadFile,
      promises: {
        open: mockOpen,
      },
    };

    setFs(partialMock);
    expect(getFs()).toBe(partialMock);
    expect(getFs().readFile).toBe(mockReadFile);
    expect(getFs().promises?.open).toBe(mockOpen);
  });

  it('enables retryOpen when setFs is called with retryOpen: true', () => {
    const fakeFs: IFsLike = {
      stat: jest.fn(),
    };

    setFs(fakeFs, { retryOpen: true });
    expect(getFsOptions().retryOpen).toBe(true);
  });

  it('restores default fs implementation and options on resetFs', () => {
    const fakeFs: IFsLike = {
      stat: jest.fn(),
    };

    setFs(fakeFs, { retryOpen: true });
    expect(getFs()).toBe(fakeFs);
    expect(getFsOptions().retryOpen).toBe(true);

    resetFs();
    expect(getFs()).toBe(nodeFs);
    expect(getFsOptions().retryOpen).toBe(false);
  });
});
