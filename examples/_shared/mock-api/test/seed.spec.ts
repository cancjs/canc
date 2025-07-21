import { createMockApi } from '../src';

describe('mock-api seed determinism', () => {
 it('produces identical seeded results across two instances with the same seed', async () => {
 const a = createMockApi({ seedMode: true, seed: 42 });
 const b = createMockApi({ seedMode: true, seed: 42 });

 const [qa1, qa2] = [await a.suppliers.quote('s1'), await a.suppliers.quote('s2')];
 const [qb1, qb2] = [await b.suppliers.quote('s1'), await b.suppliers.quote('s2')];

 expect(qa1).toEqual(qb1);
 expect(qa2).toEqual(qb2);
 });

 it('differs when seeds differ', async () => {
 const a = createMockApi({ seedMode: true, seed: 1 });
 const b = createMockApi({ seedMode: true, seed: 2 });

 const qa = await a.suppliers.quote('s1');
 const qb = await b.suppliers.quote('s1');

 expect(qa.amount).not.toEqual(qb.amount);
 });

 it('produces a deterministic embedding ranking for the same query', async () => {
 const a = createMockApi({ seedMode: true });
 const b = createMockApi({ seedMode: true });

 const ra = (await a.rag.search('cancel propagation')).map((c) => c.id);
 const rb = (await b.rag.search('cancel propagation')).map((c) => c.id);

 expect(ra).toEqual(rb);
 });

 it('forces zero latency in seed mode (call completes on the timer boundary)', async () => {
 const mock = createMockApi({ seedMode: true });
 const record = mock.api.calls;

 await mock.products.list();

 const call = record.find((c) => c.endpoint === 'products.list');
 expect(call?.status).toBe('completed');
 expect(call?.settledAt).toBeGreaterThanOrEqual(call?.startedAt ?? 0);
 });
});
