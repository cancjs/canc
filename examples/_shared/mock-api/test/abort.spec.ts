import { createMockApi, isAbortError } from '../src';

describe('mock-api abort', () => {
 it('rejects with an AbortError and records an aborted marker when canceled mid-latency', async () => {
 const mock = createMockApi({ latency: 50, jitter: 0 });
 const controller = new AbortController();

 const pending = mock.products.list(controller.signal);

 // Abort while the call is still in flight (latency has not elapsed).
 controller.abort();

 let caught: unknown;
 try {
 await pending;
 } catch (error) {
 caught = error;
 }

 expect(isAbortError(caught)).toBe(true);

 const record = mock.api.calls.find((c) => c.endpoint === 'products.list');
 expect(record).toBeDefined();
 expect(record?.status).toBe('aborted');
 expect(record?.settledAt).toBeGreaterThanOrEqual(0);
 });

 it('rejects immediately for a pre-aborted signal without completing', async () => {
 const mock = createMockApi({ latency: 50, jitter: 0 });
 const controller = new AbortController();
 controller.abort();

 await expect(mock.orders.list(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });

 const record = mock.api.calls.find((c) => c.endpoint === 'orders.list');
 expect(record?.status).toBe('aborted');
 });

 it('completes normally and records a completed marker when never aborted', async () => {
 const mock = createMockApi({ seedMode: true });

 const products = await mock.products.list();
 expect(products.length).toBeGreaterThan(0);

 const record = mock.api.calls.find((c) => c.endpoint === 'products.list');
 expect(record?.status).toBe('completed');
 });

 it('aborts a token stream mid-flight, surfacing an AbortError out of the generator', async () => {
 const mock = createMockApi({ latency: 30, jitter: 0 });
 const controller = new AbortController();

 // Abort while a token's latency is in flight (between two tokens), so the pending respond()
 // rejects and the generator surfaces an AbortError. 45ms lands inside the second token's wait.
 setTimeout(() => controller.abort(), 45);

 const received: string[] = [];
 let caught: unknown;
 try {
 for await (const token of mock.chat.stream('hello world from canc', controller.signal)) {
 received.push(token);
 }
 } catch (error) {
 caught = error;
 }

 expect(isAbortError(caught)).toBe(true);
 expect(received.length).toBeGreaterThan(0);
 const aborted = mock.api.calls.filter((c) => c.status === 'aborted');
 expect(aborted.length).toBeGreaterThan(0);
 expect(aborted.every((c) => c.endpoint.startsWith('chat.token'))).toBe(true);
 });

 it('routes mockFetch through the fake network and aborts with the signal', async () => {
 const mock = createMockApi({ latency: 40, jitter: 0 });
 const controller = new AbortController();

 const pending = mock.fetch('/products', { signal: controller.signal });
 controller.abort();

 await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
 expect(mock.api.calls.some((c) => c.endpoint === 'products.list' && c.status === 'aborted')).toBe(true);
 });
});
