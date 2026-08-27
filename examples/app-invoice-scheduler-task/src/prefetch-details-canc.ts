// background prefetch of invoice details for rows around viewport
// cancel during asynchronous task aborts suspended network request

import { cancelify, retry } from '@cancjs/toolbox';
import { InvoiceDetail } from '@shared/mock-api';

import { createSchedulerTimers, ISchedulerTaskPromise, postSchedulerTask } from './lib/web-scheduler';

// --- setup

// delay threshold before fetching offscreen rows
export const PREFETCH_DELAY_MS = 100;
// total retry attempts
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

  // cancelify boundary: request carries signal
  // retry: retry does not propagate cancel into attempt already in flight
  // postSchedulerTask options: scheduler returns native promise so task cancel cannot reach body
  const loadDetail = cancelify(({ getSignal }) => invoicesApi.detail(id, getSignal()), { signal: lifetime });

  const task = postSchedulerTask(
    () =>
      retry(loadDetail, {
        retries: PREFETCH_ATTEMPTS,
        initialDelay: PREFETCH_BACKOFF_MS,
        onRetry: (_reason, attempt: number) => options?.onRetry?.(attempt),
        signal: lifetime,
        // backoff wait is a background task so retries do not block visible work
        ...createSchedulerTimers({ priority: 'background' }),
      }),
    // canceled while queued: entry dropped and request never made
    { priority: 'background', delay: PREFETCH_DELAY_MS, signal: lifetime },
  );

  inFlight.set(id, task);

  // unregister completed prefetch from in-flight map
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
  // reprioritize task controller to user-blocking band
  prefetch.priority = 'user-blocking';
}

// aligned placeholder to match vanilla export signature
// (no cancellation counterpart: canceling render run drops queued prefetches automatically)

// --- plumbing

// none: delay, abort propagation, and retry are handled by toolbox helpers
