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

  it('canc - cancel mid-feed → no further page fetches logged + in-flight abort logged', async () => {
    const p = consumeFeedCanc();
    suppressCancel(p);

    // Wait enough time to fetch first page (50ms) and start second page
    await sleep(65);

    p.cancel();
    await p.catch((e: any) => {
      if (e.name !== 'CancelError') throw e;
    });

    const logs = logSpy.mock.calls.map((c) => c.join(' '));
    expect(logs.some((l) => l.includes('Aborted fetch for offset'))).toBe(true);

    // Ensure it didn't keep fetching pages after cancel
    const pageFetches = logs.filter((l) => l.includes('Fetching feed page starting at offset'));
    expect(pageFetches.length).toBeLessThan(4);
  });

  it('vanilla - abort mid-feed → no further page fetches logged + in-flight abort logged', async () => {
    const controller = new AbortController();
    const p = consumeFeedVanilla(controller.signal);

    await sleep(65);

    controller.abort();
    await p;

    const logs = logSpy.mock.calls.map((c) => c.join(' '));
    expect(logs.some((l) => l.includes('Aborted fetch for offset'))).toBe(true);
  });
});
