// shell wiring for search, chunked render, and background prefetch (vanilla)

import { createMockApi, Invoice } from '@shared/mock-api';

import { getPlatformScheduler } from './platform-scheduler';
import { prefetchDetails, promote, supersedePrefetches, trackedPrefetches } from './prefetch-details-vanilla';
import { DEFAULT_CHUNK_SIZE, renderInvoicesScheduled } from './render-table-vanilla';
import { IInvoiceRow } from './table-shared';
import { createReportCounters, renderReportCounters } from './util/report';
import { createResponsivenessReport } from './util/responsiveness';

const root = document.getElementById('app');
if (!root) {
  throw new Error('missing #app mount point');
}

const heading = document.createElement('h1');
heading.textContent = 'Invoice Ledger';

const filterInput = document.createElement('input');
filterInput.type = 'text';
filterInput.id = 'filter';
filterInput.placeholder = 'Filter by customer';

const chunkSizeSelect = document.createElement('select');
chunkSizeSelect.id = 'chunk-size';
for (const rowsPerChunk of [100, 1000]) {
  const option = document.createElement('option');
  option.value = String(rowsPerChunk);
  option.textContent = `${rowsPerChunk} rows per chunk`;
  chunkSizeSelect.append(option);
}

const statusLine = document.createElement('div');
statusLine.id = 'status';
statusLine.textContent = getPlatformScheduler() ? 'scheduler: available' : 'scheduler: unavailable, using timers';

const reportPanel = document.createElement('div');
reportPanel.id = 'report';

const responsivenessPanel = document.createElement('div');
responsivenessPanel.id = 'responsiveness';
createResponsivenessReport(responsivenessPanel);

const table = document.createElement('table');
table.id = 'invoices-table';
const tbody = document.createElement('tbody');
table.append(tbody);

root.append(heading, filterInput, chunkSizeSelect, statusLine, reportPanel, responsivenessPanel, table);

// --- wiring

const api = createMockApi();
const counters = createReportCounters();
renderReportCounters(reportPanel, counters);

// fallback when IntersectionObserver is unsupported
const hasIntersectionObserver = typeof IntersectionObserver !== 'undefined';

// far margin starts background prefetch ahead of viewport
const farObserver =
  hasIntersectionObserver ?
    new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          farObserver?.unobserve(entry.target);
          const id = invoiceIdOf(entry.target);
          if (!id) continue;

          const prefetch = prefetchDetails(api.invoices, id, undefined, {
            onRetry: () => {
              counters.reportRetries += 1;
              renderReportCounters(reportPanel, counters);
            },
          });
          counters.reportPrefetchesStarted += 1;
          renderReportCounters(reportPanel, counters);
          void prefetch.promise.then(
            () => renderReportCounters(reportPanel, counters),
            () => renderReportCounters(reportPanel, counters),
          );

          nearObserver?.observe(entry.target);
        }
      },
      { rootMargin: '600px' },
    )
  : undefined;

// near margin promotes visible row prefetch to user-blocking
const nearObserver =
  hasIntersectionObserver ?
    new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        nearObserver?.unobserve(entry.target);
        const id = invoiceIdOf(entry.target);
        const prefetch = id ? trackedPrefetches.get(id) : undefined;
        if (prefetch) {
          promote(prefetch);
        }
      }
    })
  : undefined;

const tbodyObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if ((node as HTMLElement).tagName === 'TR') {
        farObserver?.observe(node as Element);
      }
    }
  }

  counters.reportRowsRendered = tbody.rows.length;
  statusLine.textContent = `rendered ${tbody.rows.length} of ${totalForRun}`;
  renderReportCounters(reportPanel, counters);
});
tbodyObserver.observe(tbody, { childList: true });

function invoiceIdOf(target: Element): string | undefined {
  return (target as HTMLTableRowElement).cells?.[0]?.textContent ?? undefined;
}

function toInvoiceRows(invoices: readonly Invoice[]): IInvoiceRow[] {
  return invoices.map((invoice) => ({
    id: invoice.id,
    customer: invoice.customer,
    total: invoice.total,
    paid: invoice.paid,
    issuedAt: new Date(invoice.issuedAt).toISOString(),
  }));
}

let currentController: AbortController | undefined;
let totalForRun = 0;

async function startQuery(filterText: string, chunkSize: number): Promise<void> {
  // abort in-flight query and cancel open prefetches in registry
  currentController?.abort('the filter changed');
  counters.reportPrefetchesCanceled += trackedPrefetches.size;
  supersedePrefetches('the filter changed');
  renderReportCounters(reportPanel, counters);

  const controller = new AbortController();
  currentController = controller;

  tbody.replaceChildren();
  totalForRun = 0;
  statusLine.textContent = 'loading...';

  try {
    const invoices = await api.invoices.search(filterText, controller.signal);

    if (controller.signal.aborted) {
      // ignore completed query if superseded while in flight
      return;
    }

    const rows = toInvoiceRows(invoices);
    totalForRun = rows.length;

    await renderInvoicesScheduled(tbody, rows, controller.signal, { chunkSize });
  } catch (error) {
    if (!controller.signal.aborted) {
      throw error;
    }
  }
}

function currentChunkSize(): number {
  return Number(chunkSizeSelect.value) || DEFAULT_CHUNK_SIZE;
}

// ambient timer debounce with unprioritized callback
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function debouncedFilter(value: string): void {
  if (debounceTimer !== undefined) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    void startQuery(value, currentChunkSize());
  }, 150);
}

filterInput.addEventListener('input', () => {
  debouncedFilter(filterInput.value);
});

chunkSizeSelect.addEventListener('change', () => {
  void startQuery(filterInput.value, currentChunkSize());
});

void startQuery('', currentChunkSize());
