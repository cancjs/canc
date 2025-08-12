import { sleep } from '../../_shared/util/src/index';
import { createMockFetch, MockApi } from '../../_shared/mock-api/src/index';
import { searchRepos, searchReposWithExternal, searchReposWithTimeout } from '../src/repo-search-canc';

describe('demo-fetch cancellation', () => {
 let api: MockApi;
 let fetch: any;

 beforeEach(() => {
 api = new MockApi({ seedMode: true });
 fetch = createMockFetch(api);
 });

 it('chain cancel aborts detail fetch mid-flight', async () => {
 const promise = searchRepos('', fetch);
 await sleep(10);
 promise.cancel();

 await expect(promise).rejects.toThrow();
 // Detail fetch (second call) should be aborted.
 const abortedCall = api.calls.find((c) => c.endpoint === 'products.get' && c.status === 'aborted');
 expect(abortedCall).toBeDefined();
 });

 it('timeout cancels underlying fetch', async () => {
 const promise = searchReposWithTimeout('', fetch, 30);
 await expect(promise).rejects.toThrow();
 const abortedCall = api.calls.find((c) => c.status === 'aborted');
 expect(abortedCall).toBeDefined();
 });

 it('pre-aborted signal does not start any fetch', async () => {
 const controller = new AbortController();
 controller.abort();
 const promise = searchReposWithExternal('', fetch, controller.signal);
 await expect(promise).rejects.toThrow();
 // No started calls (born-canceled).
 const completedOrStarted = api.calls.filter((c) => c.status !== 'aborted');
 expect(completedOrStarted.length).toBe(0);
 });
});
