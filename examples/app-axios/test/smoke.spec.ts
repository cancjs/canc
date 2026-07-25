import axios from 'axios';
import { createMockApi } from '@shared/mock-api';
import cancelableAxios from '@cancjs/axios';
import { isCancelError } from '@cancjs/promise';

describe('app-axios smoke', () => {
 it('cancels a request via the cancelable wrapper', async () => {
 const mockBundle = createMockApi();
 const instance = axios.create({
 adapter: mockBundle.axiosAdapter as any,
 });

 const cancApi = cancelableAxios.wrap(instance);

 // Start a request and immediately cancel it.
 const searchPromise = cancApi.get('/issues/search', { params: { q: 'bug' } });
 searchPromise.cancel('test cancel');

 // The promise should reject with a CancelError (via cancelify's AbortSignal mapping).
 await expect(searchPromise).rejects.toThrow();

 // Verify it was canceled (not another error).
 try {
 await searchPromise;
 } catch (err: unknown) {
 expect(isCancelError(err)).toBe(true);
 }
 });

 it('vanilla typecheck', async () => {
 // Just boot the vanilla flavor to ensure it compiles.
 const mockBundle = createMockApi();
 const instance = axios.create({
 adapter: mockBundle.axiosAdapter as any,
 });

 // Smoke: vanilla client creation.
 const { VanillaIssuesClient } = await import('../src/issues-client-vanilla');
 const client = new VanillaIssuesClient(instance);
 expect(client).toBeDefined();
 });

 it('canc typecheck', async () => {
 // Just boot the canc flavor to ensure it compiles.
 const mockBundle = createMockApi();
 const instance = axios.create({
 adapter: mockBundle.axiosAdapter as any,
 });

 // Smoke: canc client creation.
 const { CancIssuesClient } = await import('../src/issues-client-canc');
 const client = new CancIssuesClient(instance);
 expect(client).toBeDefined();
 });
});
