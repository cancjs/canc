// Chunked render of the invoice table, cancelable. Same shape as render-table-vanilla.ts: the first
// screenful is posted at the highest priority, the rest of the rows land in chunks that hand the
// thread back between them.
//
// Cancellation reaches this render in three different places, and that is the lesson of the file. A
// task still sitting in the queue is dequeued and never runs. A chunk that is already running lands
// in full, because nothing interrupts a synchronous body. A coroutine suspended at a yield stops
// right there and runs its cleanup.

import * as canc from '@cancjs/coroutine';

import { postSchedulerTask, yieldSchedulerTask } from './lib/web-scheduler';
import { appendChunk, IInvoiceRow } from './table-shared';

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

// no signal parameter: canceling the returned promise is the whole story
export const renderInvoices = canc.async(function* (
  tbody: HTMLTableSectionElement,
  invoices: readonly IInvoiceRow[],
  options?: IRenderOptions,
) {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  // no scheduler here (Safari, node) and the library falls back to the timers pair on its own
  tbody.replaceChildren();
  tbody.dataset.rendering = 'true';
  let lastYield = performance.now();

  // no controller to mint and no abort listener to forward: the task owns one already
  try {
    const firstScreenful = postSchedulerTask(() => appendChunk(tbody, invoices.slice(0, FIRST_SCREENFUL)), {
      priority: 'user-blocking',
    });
    // canceled while this task is queued: it is dequeued and the callback never runs
    yield* canc.await(firstScreenful);

    for (let index = FIRST_SCREENFUL; index < invoices.length; index += chunkSize) {
      // canceled while this append runs: the chunk still lands in full, because a running task
      // cannot be interrupted. chunk size IS the cancel latency
      appendChunk(tbody, invoices.slice(index, index + chunkSize));

      if (performance.now() - lastYield > FRAME_BUDGET_MS) {
        // canceled while suspended here: nothing below runs, and the cleanup follows
        yield* canc.await(yieldSchedulerTask());
        lastYield = performance.now();
      }
    }
  } finally {
    // --- cleanup

    // runs on cancel too. rows that already landed stay until the next render replaces them
    delete tbody.dataset.rendering;
  }
});
