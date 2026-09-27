import { isAbortError } from '@cancjs/toolbox';
import { createMockApi, Invoice, InvoiceDetail } from '@shared/mock-api';

describe('mock invoices domain', () => {
  it("search('') resolves all 5,000 generated invoices, deterministic by seed", async () => {
    const a = createMockApi({ seedMode: true });
    const b = createMockApi({ seedMode: true });

    const all: Invoice[] = await a.invoices.search('');
    expect(all).toHaveLength(5000);

    const other: Invoice[] = await b.invoices.search('');
    expect(other[0].id).toBe(all[0].id);
    expect(other[other.length - 1].id).toBe(all[all.length - 1].id);
  });

  it('search filters by customer, case-insensitively', async () => {
    const api = createMockApi({ seedMode: true });

    const matches = await api.invoices.search('acme');

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThan(5000);
    expect(matches.every((invoice) => invoice.customer.toLowerCase().includes('acme'))).toBe(true);
  });

  it('detail resolves a heavier payload with lines, and the seeded failing id rejects', async () => {
    const api = createMockApi({ seedMode: true });
    const all = await api.invoices.search('');

    let succeeded: InvoiceDetail | undefined;
    let failingId: string | undefined;
    for (const invoice of all.slice(0, 200)) {
      if (succeeded && failingId) break;
      try {
        const detail = await api.invoices.detail(invoice.id);
        succeeded = succeeded ?? detail;
      } catch {
        failingId = failingId ?? invoice.id;
      }
    }

    expect(succeeded).toBeDefined();
    expect(succeeded?.lines.length).toBeGreaterThan(0);
    expect(failingId).toBeDefined();
    await expect(api.invoices.detail(failingId as string)).rejects.toThrow();
  });

  it('aborting a detail call mid-flight leaves an aborted call record and rejects', async () => {
    const api = createMockApi({ latency: 40, jitter: 0 });
    const controller = new AbortController();

    const pending = api.invoices.detail('inv-0001', controller.signal);
    controller.abort();

    let caught: unknown;
    try {
      await pending;
    } catch (error) {
      caught = error;
    }

    expect(isAbortError(caught)).toBe(true);
    const record = api.api.calls.find((c) => c.endpoint === 'invoices.detail');
    expect(record?.status).toBe('aborted');
  });

  it('seedMode settles with zero latency, no real sleep needed', async () => {
    const api = createMockApi({ seedMode: true });

    await api.invoices.get('audit-1');

    const record = api.api.calls.find((c) => c.endpoint === 'invoices.get');
    expect(record?.status).toBe('completed');
    expect(record?.settledAt).toBeGreaterThanOrEqual(record?.startedAt ?? 0);
  });
});
