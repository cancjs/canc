describe('app-invoice-scheduler-task boot', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('mounts the vanilla shell with an empty table', async () => {
    await import('../src/main-vanilla');

    expect(document.getElementById('filter')).not.toBeNull();
    expect(document.getElementById('chunk-size')).not.toBeNull();
    expect(document.getElementById('status')).not.toBeNull();
    expect(document.getElementById('report')).not.toBeNull();

    const tbody = document.querySelector('#invoices-table tbody');
    expect(tbody).not.toBeNull();
    expect(tbody?.children.length).toBe(0);
  });

  it('mounts the canc shell with an empty table', async () => {
    await import('../src/main-canc');

    expect(document.getElementById('filter')).not.toBeNull();
    expect(document.getElementById('chunk-size')).not.toBeNull();
    expect(document.getElementById('status')).not.toBeNull();
    expect(document.getElementById('report')).not.toBeNull();

    const tbody = document.querySelector('#invoices-table tbody');
    expect(tbody).not.toBeNull();
    expect(tbody?.children.length).toBe(0);
  });
});
