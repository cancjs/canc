// Background prefetch of invoice details for the rows around the viewport. Same shape as
// prefetch-details-vanilla.ts: one task per row in the lowest band, promoted the moment the row
// becomes visible, dropped as soon as the render run it belongs to is superseded.
//
// This is the third place cancellation lands. The body of this task is asynchronous, so a cancel
// does not just abandon it: it reaches the request the body is suspended on, and the call log
// shows an aborted request instead of a completed one nobody read.

import { cancelify, retry } from '@cancjs/toolbox';
import { InvoiceDetail } from '@shared/mock-api';

import { createSchedulerTimers, ISchedulerTaskPromise, postSchedulerTask } from './lib/web-scheduler';

// --- setup

// long enough that a row flicked past on the way somewhere else never reaches the network
export const PREFETCH_DELAY_MS = 100;
// attempts in total, the first one included
export const PREFETCH_ATTEMPTS = 3;
export const PREFETCH_BACKOFF_MS = 200;

/** The one endpoint a prefetch needs, so a caller can pass any invoice service that has it. */
export interface IInvoiceDetailSource {
  detail(id: string, signal?: AbortSignal): Promise<InvoiceDetail>;
}

export interface IPrefetchOptions {
  /** Demo counter hook, called with the 1-based attempt that failed. */
  onRetry?: (attempt: number) => void;
}

const inFlight = new Map<string, ISchedulerTaskPromise<InvoiceDetail>>();

/** Prefetches that have not settled yet, keyed by invoice id. */
export const trackedPrefetches: ReadonlyMap<string, ISchedulerTaskPromise<InvoiceDetail>> = inFlight;

// --- consume

/**
 * Start prefetching one invoice's detail, or hand back the prefetch already running for it.
 * `lifetime` is the render run these prefetches belong to.
 */
export function prefetchDetails(
  invoicesApi: IInvoiceDetailSource,
  id: string,
  lifetime?: AbortSignal,
  options?: IPrefetchOptions,
): ISchedulerTaskPromise<InvoiceDetail> {
  const running = inFlight.get(id);

  if (running) {
    return running;
  }

  // the api boundary is cancelified once and nothing below this line passes a signal around. the
  // lifetime cancels the attempt, and canceling an attempt aborts the request it is waiting on
  const loadDetail = cancelify(({ getSignal }) => invoicesApi.detail(id, getSignal()), { signal: lifetime });

  const task = postSchedulerTask(
    () =>
      retry(loadDetail, {
        retries: PREFETCH_ATTEMPTS,
        minTimeout: PREFETCH_BACKOFF_MS,
        onRetry: (_reason, attempt: number) => options?.onRetry?.(attempt),
        signal: lifetime,
        // the backoff wait is itself a background task, so a retry never resumes ahead of the work
        // the user is looking at
        ...createSchedulerTimers({ priority: 'background' }),
      }),
    // canceled while queued: the entry is dropped and the request is never made
    { priority: 'background', delay: PREFETCH_DELAY_MS, signal: lifetime },
  );

  inFlight.set(id, task);

  // bookkeeping, not error handling. whoever holds the task reads its result, and a prefetch that
  // is gone leaves nothing behind for a row that has to load its detail on demand
  const forget = (): void => {
    if (inFlight.get(id) === task) {
      inFlight.delete(id);
    }
  };

  void task.then(forget, forget);

  return task;
}

/** Move a prefetch into the band the user is waiting on, once its row is actually visible. */
export function promote(prefetch: ISchedulerTaskPromise<InvoiceDetail>): void {
  // the task owns its controller, so this still moves a queued task even though the prefetch was
  // posted under a lifetime of someone else's
  prefetch.priority = 'user-blocking';
}

// aligned placeholder to match vanilla export signature
// (no canc counterpart: every prefetch is posted under the render run's lifetime, so canceling
// that run drops the queued ones and aborts the running one automatically)

// --- plumbing

// none. the wait between attempts, the abort plumbing and the retry budget are all the toolbox
// call above, see prefetch-details-vanilla.ts for what they cost by hand
