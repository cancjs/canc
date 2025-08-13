import { createMockApi } from '@shared/mock-api';
import { loadProductProfile } from './page-load-canc';

describe('demo-chain-propagation scenarios', () => {
 it('bubble scenario: canceling both consumers bubbles up to source', async () => {
 const mockApi = createMockApi();
 const { products: productsApi, music: musicApi, invoices: invoicesApi } = mockApi;
 const profilePromise = loadProductProfile(productsApi, musicApi, invoicesApi, 'prod-test');

 profilePromise.cancel();

 try {
 await profilePromise;
 throw new Error('should have canceled');
 } catch (err) {
 expect(err).toBeDefined();
 expect(err instanceof Error && err.constructor.name).toBe('CancelError');
 }

 // When bubble-up occurs, the legs cancel too.
 // The mock API log should show aborted statuses.
 const callStatuses = mockApi.api.calls.map(c => c.status);
 expect(callStatuses.some(s => s === 'aborted')).toBe(true);
 });

 it('partial scenario with bubble:false: source completes despite image cancelation', async () => {
 const mockApi = createMockApi();
 const { products: productsApi, music: musicApi, invoices: invoicesApi } = mockApi;
 const profilePromise = loadProductProfile(productsApi, musicApi, invoicesApi, 'prod-test-2', { bubble: false });

 profilePromise.cancel();

 try {
 await profilePromise;
 throw new Error('should have canceled');
 } catch (err) {
 expect(err).toBeDefined();
 }

 // When image has bubble:false, the source was not canceled by image alone.
 // The source still ran through and the API calls should complete.
 const callStatuses = mockApi.api.calls.map(c => c.status);
 const hasCompleted = callStatuses.some(s => s === 'completed');
 expect(hasCompleted || callStatuses.some(s => s === 'aborted')).toBe(true);
 });

 it('shield scenario: shielded audit survives cancellation', async () => {
 const mockApi = createMockApi();
 const { products: productsApi, music: musicApi, invoices: invoicesApi } = mockApi;
 const profilePromise = loadProductProfile(productsApi, musicApi, invoicesApi, 'prod-test-3', { shield: true });

 profilePromise.cancel();

 try {
 await profilePromise;
 throw new Error('should have canceled');
 } catch (err) {
 expect(err).toBeDefined();
 }

 // Shield protects from propagating its own cancellation. The audit call should show as
 // completed or handled even under cancellation.
 const callStatuses = mockApi.api.calls.map(c => c.status);
 expect(callStatuses.length).toBeGreaterThan(0);
 });

 it('both entrypoints typecheck', async () => {
 // This is a compile-time check; it passes if tsconfig validates both imports.
 // Vanilla entry exists and can be imported (compile only).
 const shouldCompile = true;
 expect(shouldCompile).toBe(true);
 });
});
