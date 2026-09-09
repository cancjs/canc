import { suppressCancel } from '@cancjs/promise';
import { sleep } from '@shared/util';

import { consumeFeedCanc } from '../src/feed-streaming-canc';
import { consumeFeedVanilla } from '../src/feed-streaming-vanilla';

describe('app-fetch-streaming smoke', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('canc - cancel mid-feed -> no further page fetches logged + in-flight abort logged', async () => {
    const logs: string[] = [];
    const cancelRef = { cancel: () => {} };

    logSpy.mockImplementation((...args: unknown[]) => {
      const line = args.join(' ');
      logs.push(line);
      const pageFetches = logs.filter((l) => l.includes('Fetching feed page starting at offset'));
      if (pageFetches.length === 2) {
        setImmediate(() => cancelRef.cancel());
      }
    });

    const p = consumeFeedCanc();
    cancelRef.cancel = () => p.cancel();
    suppressCancel(p);

    await expect(p).rejects.toMatchObject({ name: 'CancelError' });

    expect(logs.some((l) => l.includes('Aborted fetch for offset'))).toBe(true);

    const countBefore = logs.filter((l) => l.includes('Fetching feed page starting at offset')).length;
    await sleep(100);
    const countAfter = logs.filter((l) => l.includes('Fetching feed page starting at offset')).length;
    expect(countAfter).toBe(countBefore);
  });

  it('vanilla - abort mid-feed -> no further page fetches logged + in-flight abort logged', async () => {
    const logs: string[] = [];
    const controller = new AbortController();

    logSpy.mockImplementation((...args: unknown[]) => {
      const line = args.join(' ');
      logs.push(line);
      const pageFetches = logs.filter((l) => l.includes('Fetching feed page starting at offset'));
      if (pageFetches.length === 2) {
        setImmediate(() => controller.abort());
      }
    });

    const p = consumeFeedVanilla(controller.signal);
    await p;

    expect(logs.some((l) => l.includes('Aborted fetch for offset'))).toBe(true);

    const countBefore = logs.filter((l) => l.includes('Fetching feed page starting at offset')).length;
    await sleep(100);
    const countAfter = logs.filter((l) => l.includes('Fetching feed page starting at offset')).length;
    expect(countAfter).toBe(countBefore);
  });
});
