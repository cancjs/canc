jest.mock('@shared/mock-api', () => {
  const search = jest.fn(async () => []);
  const detail = jest.fn();

  return {
    createMockApi: () => ({
      invoices: { search, detail, list: jest.fn(), get: jest.fn() },
      api: { calls: [] },
    }),
    __search: search,
  };
});

describe('app-invoice-scheduler-task boot', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('mounts the vanilla shell with an empty table', async () => {
    await import('../src/main-vanilla');

    expect(document.querySelector('h1')?.textContent).toBe('Invoice Ledger');
    expect(document.getElementById('filter')).not.toBeNull();
    expect(document.getElementById('chunk-size')).not.toBeNull();
    expect(document.getElementById('status')).not.toBeNull();
    expect(document.getElementById('report')).not.toBeNull();
    expect(document.getElementById('invoices-table')).not.toBeNull();

    const tbody = document.querySelector('#invoices-table tbody');
    expect(tbody).not.toBeNull();
    expect(tbody?.children.length).toBe(0);
  });

  it('mounts the canc shell with an empty table', async () => {
    await import('../src/main-canc');

    expect(document.querySelector('h1')?.textContent).toBe('Invoice Ledger');
    expect(document.getElementById('filter')).not.toBeNull();
    expect(document.getElementById('chunk-size')).not.toBeNull();
    expect(document.getElementById('status')).not.toBeNull();
    expect(document.getElementById('report')).not.toBeNull();
    expect(document.getElementById('invoices-table')).not.toBeNull();

    const tbody = document.querySelector('#invoices-table tbody');
    expect(tbody).not.toBeNull();
    expect(tbody?.children.length).toBe(0);
  });
});
