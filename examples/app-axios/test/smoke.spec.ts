import cancelableAxios from '@cancjs/axios';
import { isCancelError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';
import axios from 'axios';

import { CancIssuesClient } from '../src/issues-client-canc';
import { VanillaIssuesClient } from '../src/issues-client-vanilla';

describe('app-axios smoke', () => {
  it('cancels the previous search when a new search starts', async () => {
    const mockBundle = createMockApi({ latency: 20 });
    const instance = axios.create({
      adapter: mockBundle.axiosAdapter,
    });
    const client = new CancIssuesClient(instance);

    const search1 = client.searchIssues('bug');
    const search2 = client.searchIssues('feature');

    await expect(search1).rejects.toThrow();
    try {
      await search1;
    } catch (err: unknown) {
      expect(isCancelError(err)).toBe(true);
    }

    const result2 = await search2;
    expect(result2.issues.length).toBeGreaterThan(0);
    expect(result2.query).toBe('feature');

    expect(mockBundle.api.calls).toHaveLength(2);
    expect(mockBundle.api.calls[0]).toMatchObject({
      endpoint: 'issues.search',
      status: 'aborted',
      args: { query: 'bug' },
    });
    expect(mockBundle.api.calls[1]).toMatchObject({
      endpoint: 'issues.search',
      status: 'completed',
      args: { query: 'feature' },
    });
  });

  it('aborts an in-flight detail fetch on cancelDetail', async () => {
    const mockBundle = createMockApi({ latency: 20 });
    const instance = axios.create({
      adapter: mockBundle.axiosAdapter,
    });
    const client = new CancIssuesClient(instance);

    const detailPromise = client.getIssueWithComments(1);
    client.cancelDetail();

    await expect(detailPromise).rejects.toThrow();
    try {
      await detailPromise;
    } catch (err: unknown) {
      expect(isCancelError(err)).toBe(true);
    }

    expect(mockBundle.api.calls).toHaveLength(1);
    expect(mockBundle.api.calls[0]).toMatchObject({
      endpoint: 'issues.get',
      status: 'aborted',
      args: { id: 1 },
    });
  });

  it('vanilla client discards stale results but leaves underlying requests in flight', async () => {
    const mockBundle = createMockApi({ latency: 20 });
    const instance = axios.create({
      adapter: mockBundle.axiosAdapter,
    });
    const client = new VanillaIssuesClient(instance);

    const search1 = client.searchIssues('bug');
    const search2 = client.searchIssues('feature');

    const [result1, result2] = await Promise.all([search1, search2]);

    expect(result1).toEqual({ issues: [], query: 'bug' });
    expect(result2.issues.length).toBeGreaterThan(0);
    expect(result2.query).toBe('feature');

    expect(mockBundle.api.calls).toHaveLength(2);
    expect(mockBundle.api.calls[0]).toMatchObject({
      endpoint: 'issues.search',
      status: 'completed',
      args: { query: 'bug' },
    });
    expect(mockBundle.api.calls[1]).toMatchObject({
      endpoint: 'issues.search',
      status: 'completed',
      args: { query: 'feature' },
    });
  });

  it('cancels a request immediately via the cancelable wrapper', async () => {
    const mockBundle = createMockApi({ latency: 20 });
    const instance = axios.create({
      adapter: mockBundle.axiosAdapter,
    });

    const cancApi = cancelableAxios.wrap(instance);

    const searchPromise = cancApi.get('/issues/search', { params: { q: 'bug' } });
    searchPromise.cancel('test cancel');

    await expect(searchPromise).rejects.toThrow();
    try {
      await searchPromise;
    } catch (err: unknown) {
      expect(isCancelError(err)).toBe(true);
    }
  });
});
