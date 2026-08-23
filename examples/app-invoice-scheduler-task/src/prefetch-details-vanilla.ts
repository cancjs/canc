// background prefetch of invoice details for rows around viewport (vanilla)
// abort during asynchronous task aborts suspended network request

import { InvoiceDetail } from '@shared/mock-api';

import { getPlatformScheduler, IPlatformScheduler, TTaskPriority } from './platform-scheduler';

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

/** A prefetch has to travel with its controls here: the promise alone cannot be reprioritized. */
export interface IPrefetch {
  promise: Promise<InvoiceDetail>;
  abort(reason?: unknown): void;
  setPriority(priority: TTaskPriority): void;
}

const inFlight = new Map<string, IPrefetch>();

/** Prefetches that have not settled yet, keyed by invoice id. */
export const trackedPrefetches: ReadonlyMap<string, IPrefetch> = inFlight;

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
): IPrefetch {
  const running = inFlight.get(id);

  if (running) {
    return running;
  }

  const platform = getPlatformScheduler();
  const control = createPrefetchControl(platform);
  // forward lifetime abort to task controller by hand
  const onLifetimeAbort = (): void => control.abort(lifetime?.reason);
  lifetime?.addEventListener('abort', onLifetimeAbort);

  const promise = postPrefetchTask(
    // aborted while queued: entry dropped and request never made
    () => loadWithBackoff(invoicesApi, id, control.signal, platform, options),
    PREFETCH_DELAY_MS,
    control.signal,
    platform,
  );

  const prefetch: IPrefetch = { promise, abort: control.abort, setPriority: control.setPriority };

  inFlight.set(id, prefetch);

  // unregister completed prefetch and remove lifetime abort listener
  const forget = (): void => {
    lifetime?.removeEventListener('abort', onLifetimeAbort);

    if (inFlight.get(id) === prefetch) {
      inFlight.delete(id);
    }
  };

  void promise.then(forget, forget);

  return prefetch;
}

/** Move a prefetch into the band the user is waiting on, once its row is actually visible. */
export function promote(prefetch: IPrefetch): void {
  // reprioritize task controller to user-blocking band
  prefetch.setPriority('user-blocking');
}

/** Drop every prefetch of a superseded render run, one registry entry at a time. */
export function supersedePrefetches(reason?: unknown): void {
  for (const prefetch of inFlight.values()) {
    prefetch.abort(reason);
  }

  inFlight.clear();
}

// --- plumbing

/** The controls a prefetch needs beside its promise, degraded where there is no scheduler. */
interface IPrefetchControl {
  signal: AbortSignal;
  abort(reason?: unknown): void;
  setPriority(priority: TTaskPriority): void;
}

function createPrefetchControl(platform: IPlatformScheduler | undefined): IPrefetchControl {
  if (!platform) {
    // fallback without scheduler preserves lifetime signal
    const controller = new AbortController();

    return {
      signal: controller.signal,
      abort: (reason?: unknown) => controller.abort(reason),
      setPriority: () => undefined,
    };
  }

  const controller = new platform.TaskController({ priority: 'background' });

  return {
    signal: controller.signal,
    abort: (reason?: unknown) => controller.abort(reason),
    setPriority: (priority: TTaskPriority) => controller.setPriority(priority),
  };
}

async function loadWithBackoff(
  invoicesApi: IInvoiceDetailSource,
  id: string,
  signal: AbortSignal,
  platform: IPlatformScheduler | undefined,
  options?: IPrefetchOptions,
): Promise<InvoiceDetail> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await invoicesApi.detail(id, signal);
    } catch (error) {
      if (attempt >= PREFETCH_ATTEMPTS || signal.aborted) {
        throw error;
      }

      options?.onRetry?.(attempt);
      // backoff wait in background priority with manual abort forwarding
      await postPrefetchTask(() => undefined, PREFETCH_BACKOFF_MS * Math.pow(2, attempt - 1), signal, platform);
    }
  }
}

/**
 * Posts one task in the band its signal carries. No `priority` option: a task posted with one is
 * pinned to that band for life, and `setPriority` on the controller would silently stop moving it.
 */
function postPrefetchTask<T>(
  run: () => T | PromiseLike<T>,
  delay: number,
  signal: AbortSignal,
  platform: IPlatformScheduler | undefined,
): Promise<T> {
  if (platform) {
    return platform.scheduler.postTask(run, { delay, signal });
  }

  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);

      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(run());
    }, delay);

    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal.reason);
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
