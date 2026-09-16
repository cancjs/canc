// shell wiring for search, chunked render, and background prefetch

import * as canc from '@cancjs/coroutine';
import { CancelablePromise, createCancelSignal } from '@cancjs/promise';
import { cancelify, debounce } from '@cancjs/toolbox';
import { register } from '@cancjs/unhandled-rejection';
import { createMockApi, Invoice } from '@shared/mock-api';

import { createSchedulerTimers, toTaskSignal } from './lib/web-scheduler';
import { getPlatformScheduler } from './platform-scheduler';
import { prefetchDetails, promote, trackedPrefetches } from './prefetch-details-canc';
import { DEFAULT_CHUNK_SIZE, renderInvoices } from './render-table-canc';
import { IInvoiceRow } from './table-shared';
import { createReportCounters, renderReportCounters } from './util/report';
import { createResponsivenessReport } from './util/responsiveness';

// global unhandled rejection handler ignores CancelError
register();

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
          if (!id || !currentLifetime) continue;

          const task = prefetchDetails(api.invoices, id, currentLifetime, {
            onRetry: () => {
              counters.reportRetries += 1;
              renderReportCounters(reportPanel, counters);
            },
          });
          counters.reportPrefetchesStarted += 1;
          renderReportCounters(reportPanel, counters);
          void task.then(
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
        const task = id ? trackedPrefetches.get(id) : undefined;
        if (task) {
          promote(task);
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

let currentRun: CancelablePromise<void> | undefined;
let session: ReturnType<typeof createCancelSignal> | undefined;
let currentLifetime: ReturnType<typeof toTaskSignal> | undefined;
let totalForRun = 0;

const runQuery = canc.async(function* (filterText: string, chunkSize: number) {
  const loadInvoices = cancelify(({ getSignal }) => api.invoices.search(filterText, getSignal()));
  const invoices = yield* canc.await(loadInvoices());
  const rows = toInvoiceRows(invoices);
  totalForRun = rows.length;

  yield* canc.await(renderInvoices(tbody, rows, { chunkSize }));
});

function startQuery(filterText: string, chunkSize: number): void {
  // superseding previous session cancels render and drops associated prefetches
  currentRun?.cancel('the filter changed');
  session?.cancel('the filter changed');
  // record count of prefetches still open at supersede time
  counters.reportPrefetchesCanceled += trackedPrefetches.size;
  renderReportCounters(reportPanel, counters);

  const lifetime = createCancelSignal();
  session = lifetime;
  currentLifetime = toTaskSignal(lifetime.signal);

  tbody.replaceChildren();
  totalForRun = 0;
  statusLine.textContent = 'loading...';

  const run = runQuery(filterText, chunkSize);
  currentRun = run;
}

function currentChunkSize(): number {
  return Number(chunkSizeSelect.value) || DEFAULT_CHUNK_SIZE;
}

// debounce on scheduler timers in user-blocking priority band
const applyFilter = debounce((value: string) => startQuery(value, currentChunkSize()), 150, {
  ...createSchedulerTimers({ priority: 'user-blocking' }),
});

filterInput.addEventListener('input', () => {
  void applyFilter(filterInput.value);
});

chunkSizeSelect.addEventListener('change', () => {
  startQuery(filterInput.value, currentChunkSize());
});

startQuery('', currentChunkSize());
