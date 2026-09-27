import { appendChunk, createRow, IInvoiceRow } from './table-shared';
import { createResponsivenessReport } from './util/responsiveness';

function makeInvoices(count: number): IInvoiceRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `inv-${String(i + 1).padStart(4, '0')}`,
    customer: `Customer ${i}`,
    total: 100 + i,
    paid: i % 2 === 0,
    issuedAt: '2026-01-15',
  }));
}

class FakePerformanceObserver {
  static supportedEntryTypes = ['longtask'];
  constructor(private readonly callback: PerformanceObserverCallback) {}
  observe(): void {
    // no entries delivered in these tests, only presence/absence is exercised
  }
  disconnect(): void {}
  takeRecords(): PerformanceEntryList {
    return [];
  }
}

describe('table-shared', () => {
  it('appendChunk batches every row into one appendChild call', () => {
    document.body.innerHTML = '<table><tbody></tbody></table>';
    const tbody = document.querySelector('tbody') as HTMLTableSectionElement;
    const appendChildSpy = jest.spyOn(tbody, 'appendChild');

    appendChunk(tbody, makeInvoices(200));

    expect(tbody.querySelectorAll('tr').length).toBe(200);
    expect(appendChildSpy).toHaveBeenCalledTimes(1);
  });

  it('createRow formats cells instead of writing raw values', () => {
    const row = createRow({ id: 'inv-0001', customer: 'Acme', total: 1234.5, paid: true, issuedAt: '2026-01-15' });

    expect(row.cells[2].textContent).not.toBe('1234.5');
    expect(row.cells[2].textContent).toMatch(/\$/);
    expect(row.cells[3].textContent).toBe('Paid');
    expect(row.cells[4].textContent).not.toBe('2026-01-15');
  });
});

describe('createResponsivenessReport', () => {
  const originalPerformanceObserver = (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver;

  afterEach(() => {
    (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver = originalPerformanceObserver;
  });

  it('renders both numbers when PerformanceObserver exists, only the keystroke one when it does not', () => {
    (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver = FakePerformanceObserver;
    const withObserver = document.createElement('div');
    const reportWithObserver = createResponsivenessReport(withObserver);
    expect(withObserver.textContent).toMatch(/keystroke/);
    expect(withObserver.textContent).toMatch(/freeze/);
    reportWithObserver.destroy();

    delete (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver;
    const withoutObserver = document.createElement('div');
    let reportWithoutObserver: ReturnType<typeof createResponsivenessReport> | undefined;
    expect(() => {
      reportWithoutObserver = createResponsivenessReport(withoutObserver);
    }).not.toThrow();
    expect(withoutObserver.textContent).toMatch(/keystroke/);
    expect(withoutObserver.textContent).not.toMatch(/freeze/);
    reportWithoutObserver?.destroy();
  });

  it('updates the keystroke number after an input event and a driven frame', () => {
    const root = document.createElement('div');
    const frameCallbacks: FrameRequestCallback[] = [];
    const originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frameCallbacks.push(cb);
      return frameCallbacks.length;
    }) as typeof requestAnimationFrame;

    const report = createResponsivenessReport(root);
    document.dispatchEvent(new Event('input'));
    expect(frameCallbacks).toHaveLength(1);
    frameCallbacks[0](performance.now());

    expect(root.textContent).toMatch(/keystroke response: \d+ ms/);

    report.destroy();
    globalThis.requestAnimationFrame = originalRaf;
  });
});
