import { isAbortError } from '@cancjs/toolbox';
import { createMockApi, Invoice, InvoiceDetail, MockApi } from '@shared/mock-api';
import { mulberry32 } from '@shared/util';

/** Records every draw taken from the shared MockApi stream, in order, until restored. */
function recordDraws(): { draws: number[]; restore: () => void } {
  const draws: number[] = [];
  const original = MockApi.prototype.random;

  MockApi.prototype.random = function countedRandom(this: MockApi): number {
    const value = original.call(this);
    draws.push(value);
    return value;
  };

  return { draws, restore: () => void (MockApi.prototype.random = original) };
}

/** What a quote costs off an untouched stream, independent of how big the invoice dataset is. */
function expectedFirstQuotePrice(seed: number): number {
  const rand = mulberry32(seed);
  return Number((10 + rand() * 490).toFixed(2));
}

describe('mock invoices domain', () => {
  it('takes no invoice draws until an invoice endpoint is called', async () => {
    const { draws, restore } = recordDraws();

    try {
      const api = createMockApi({ seedMode: true, seed: 7 });

      expect(draws).toEqual([]);

      const quote = await api.prices.quote('CANC');

      expect(draws).toHaveLength(1);
      expect(quote.price).toBe(expectedFirstQuotePrice(7));

      const all = await api.invoices.search('');

      expect(all).toHaveLength(5000);
      expect(draws).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it('prices a quote the same whether the invoice dataset was built or not', async () => {
    const untouched = createMockApi({ seedMode: true, seed: 7 });
    const withInvoices = createMockApi({ seedMode: true, seed: 7 });

    await withInvoices.invoices.search('');

    const first = await untouched.prices.quote('CANC');
    const second = await withInvoices.prices.quote('CANC');

    // Pinned against the bare stream, so the value cannot drift when the invoice count changes.
    expect(first.price).toBe(expectedFirstQuotePrice(7));
    expect(second.price).toBe(first.price);
  });

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
  });

  it('a seeded failing id recovers once its seeded number of attempts is spent', async () => {
    const api = createMockApi({ seedMode: true });
    const all = await api.invoices.search('');

    let failingId: string | undefined;
    for (const invoice of all.slice(0, 200)) {
      try {
        await api.invoices.detail(invoice.id);
      } catch {
        failingId = invoice.id;
        break;
      }
    }

    expect(failingId).toBeDefined();

    let recovered: InvoiceDetail | undefined;
    let failures = 1;
    for (let attempt = 0; attempt < 8 && !recovered; attempt++) {
      try {
        recovered = await api.invoices.detail(failingId as string);
      } catch {
        failures++;
      }
    }

    expect(recovered?.id).toBe(failingId);
    expect(failures).toBeLessThanOrEqual(4);

    // The count is per api instance, so a fresh one fails the same id from the top again.
    await expect(createMockApi({ seedMode: true }).invoices.detail(failingId as string)).rejects.toThrow();
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
    // Fake timers so the clock cannot creep between the two markers: a latency of 0 must leave
    // settledAt on exactly startedAt, not merely at or after it.
    jest.useFakeTimers();

    try {
      const api = createMockApi({ seedMode: true });
      const pending = api.invoices.get('audit-1');

      await jest.advanceTimersByTimeAsync(0);
      await pending;

      const record = api.api.calls.find((c) => c.endpoint === 'invoices.get');
      expect(record?.status).toBe('completed');
      expect(record?.settledAt).toBe(record?.startedAt);
    } finally {
      jest.useRealTimers();
    }
  });
});
