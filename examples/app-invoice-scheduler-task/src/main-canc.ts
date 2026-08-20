// Shell only for now: filtering, rendering, and prefetching land with the entries wiring.
import { getPlatformScheduler } from './platform-scheduler';

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

const table = document.createElement('table');
table.id = 'invoices-table';
const tbody = document.createElement('tbody');
table.append(tbody);

root.append(heading, filterInput, chunkSizeSelect, statusLine, reportPanel, table);
