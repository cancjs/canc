// chunked render of invoice table (naive sync loop vs scheduled loop)

import { sleep } from '@shared/util';

import { getPlatformScheduler } from './platform-scheduler';
import { appendChunk, createRow, IInvoiceRow } from './table-shared';

// --- setup

// rows painted before anything else to display table immediately
export const FIRST_SCREENFUL = 25;
export const DEFAULT_CHUNK_SIZE = 100;

// frame budget threshold for yielding to scheduler
const FRAME_BUDGET_MS = 50;

export interface IRenderOptions {
  chunkSize?: number;
}

// --- consume

// signal parameter cannot abort synchronous loop while holding thread
export function renderInvoices(
  tbody: HTMLTableSectionElement,
  invoices: readonly IInvoiceRow[],
  signal?: AbortSignal,
): void {
  tbody.replaceChildren();
  tbody.dataset.rendering = 'true';

  for (const invoice of invoices) {
    // dead code: signal.aborted cannot flip while synchronous loop holds thread
    if (signal?.aborted) {
      break;
    }

    tbody.appendChild(createRow(invoice));
  }

  // no cleanup path: synchronous loop cannot exit early
  delete tbody.dataset.rendering;
}

export async function renderInvoicesScheduled(
  tbody: HTMLTableSectionElement,
  invoices: readonly IInvoiceRow[],
  signal?: AbortSignal,
  options?: IRenderOptions,
): Promise<void> {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const platform = getPlatformScheduler();

  if (!platform) {
    // fallback to synchronous render when scheduler is unavailable
    renderInvoices(tbody, invoices, signal);

    return;
  }

  tbody.replaceChildren();
  tbody.dataset.rendering = 'true';
  let lastYield = performance.now();

  // manual TaskController needed so caller signal can be forwarded
  const controller = new platform.TaskController({ priority: 'user-blocking' });
  const onAbort = (): void => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort);

  try {
    const firstScreenful = platform.scheduler.postTask(() => appendChunk(tbody, invoices.slice(0, FIRST_SCREENFUL)), {
      signal: controller.signal,
    });
    // aborted while queued: task is dequeued and callback never runs
    await firstScreenful;

    for (let index = FIRST_SCREENFUL; index < invoices.length; index += chunkSize) {
      // aborted while appending: running task finishes, chunk size is abort latency
      appendChunk(tbody, invoices.slice(index, index + chunkSize));

      if (performance.now() - lastYield > FRAME_BUDGET_MS) {
        // aborted while suspended: explicit check stops loop
        const yieldToScheduler = platform.scheduler.yield;
        await (yieldToScheduler ? yieldToScheduler.call(platform.scheduler) : sleep(0));

        if (signal?.aborted) {
          return;
        }

        lastYield = performance.now();
      }
    }
  } finally {
    // --- cleanup

    // runs on abort too: already appended rows stay until next render
    signal?.removeEventListener('abort', onAbort);
    delete tbody.dataset.rendering;
  }
}
