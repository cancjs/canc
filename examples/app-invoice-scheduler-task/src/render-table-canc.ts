// chunked render of invoice table with coroutine task scheduling

import * as canc from '@cancjs/coroutine';

import { postSchedulerTask, yieldSchedulerTask } from './lib/web-scheduler';
import { appendChunk, IInvoiceRow } from './table-shared';

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

// no signal parameter: canceling returned promise cancels render
export const renderInvoices = canc.async(function* (
  tbody: HTMLTableSectionElement,
  invoices: readonly IInvoiceRow[],
  options?: IRenderOptions,
) {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  // fallback timers pair used automatically when scheduler is unavailable
  tbody.replaceChildren();
  tbody.dataset.rendering = 'true';
  let lastYield = performance.now();

  // postTask creates own TaskController automatically
  try {
    const firstScreenful = postSchedulerTask(() => appendChunk(tbody, invoices.slice(0, FIRST_SCREENFUL)), {
      priority: 'user-blocking',
    });
    // canceled while queued: task is dequeued and callback never runs
    yield* canc.await(firstScreenful);

    for (let index = FIRST_SCREENFUL; index < invoices.length; index += chunkSize) {
      // canceled while appending: running task finishes, chunk size is cancel latency
      appendChunk(tbody, invoices.slice(index, index + chunkSize));

      if (performance.now() - lastYield > FRAME_BUDGET_MS) {
        // canceled while suspended: yield stops and cleanup runs
        yield* canc.await(yieldSchedulerTask());
        lastYield = performance.now();
      }
    }
  } finally {
    // --- cleanup

    // runs on cancel too: already appended rows stay until next render
    delete tbody.dataset.rendering;
  }
});
