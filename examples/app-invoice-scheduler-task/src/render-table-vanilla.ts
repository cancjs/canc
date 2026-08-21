// Chunked render of the invoice table, plain version. Two flavors live here: the naive loop that
// owns the thread until the last row, and the scheduled loop that hands the thread back between
// chunks and rechecks its abort signal every time it comes back.
//
// The scheduled flavor is the fair comparison for render-table-canc.ts. It works. What the diff
// shows is the controller, the forwarding listener and the aborted checks that the coroutine twin
// never has to write.

import { sleep } from '@shared/util';

import { getPlatformScheduler } from './platform-scheduler';
import { appendChunk, createRow, IInvoiceRow } from './table-shared';

// --- setup

// rows painted before anything else, so the page shows a table instead of a blank area
export const FIRST_SCREENFUL = 25;
export const DEFAULT_CHUNK_SIZE = 100;

// a yield costs a task hop, so chunks are timed rather than counted
const FRAME_BUDGET_MS = 50;

export interface IRenderOptions {
  chunkSize?: number;
}

// --- consume

// signal is here only to show what it cannot do, see the check inside the loop
export function renderInvoices(
  tbody: HTMLTableSectionElement,
  invoices: readonly IInvoiceRow[],
  signal?: AbortSignal,
): void {
  tbody.replaceChildren();
  tbody.dataset.rendering = 'true';

  for (const invoice of invoices) {
    // dead code: nothing can flip signal.aborted while this loop holds the thread, so the handler
    // that would abort it only gets to run once the last row has landed
    if (signal?.aborted) {
      break;
    }

    tbody.appendChild(createRow(invoice));
  }

  // no cleanup path to speak of: the caller cannot get out of here early
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
    // no scheduler here (Safari, node), so this degrades to the frozen render above
    renderInvoices(tbody, invoices, signal);

    return;
  }

  tbody.replaceChildren();
  tbody.dataset.rendering = 'true';
  let lastYield = performance.now();

  // the task needs a controller of its own to stay reprioritizable later, so the caller's signal is
  // forwarded onto it by hand
  const controller = new platform.TaskController({ priority: 'user-blocking' });
  const onAbort = (): void => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort);

  try {
    const firstScreenful = platform.scheduler.postTask(() => appendChunk(tbody, invoices.slice(0, FIRST_SCREENFUL)), {
      signal: controller.signal,
    });
    // aborted while this task is queued: it is dequeued and the callback never runs
    await firstScreenful;

    for (let index = FIRST_SCREENFUL; index < invoices.length; index += chunkSize) {
      // aborted while this append runs: the chunk still lands in full, because a running task
      // cannot be interrupted. chunk size IS the abort latency
      appendChunk(tbody, invoices.slice(index, index + chunkSize));

      if (performance.now() - lastYield > FRAME_BUDGET_MS) {
        // aborted while suspended here: the check below is the only thing that stops the loop
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

    // runs on abort too. rows that already landed stay until the next render replaces them
    signal?.removeEventListener('abort', onAbort);
    delete tbody.dataset.rendering;
  }
}
