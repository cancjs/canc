import { CancelSignal, createCancelSignal } from '@cancjs/promise';

import { CLIENT_DISCONNECTED } from './reasons';

/** The part of a Web `Request` this layer reads. */
export interface IWebRequestLike {
  signal?: AbortSignal | null;
}

/** A minted request cancel signal and the handle that aborts it. */
export interface IWebRequestSignal {
  signal: CancelSignal;
  cancel: (reason?: unknown) => void;
}

interface IAbortSignalStatics {
  any?: (signals: AbortSignal[]) => AbortSignal;
}

/**
 * Folds several abort signals into one. Uses `AbortSignal.any` where the runtime has it and falls
 * back to a controller fed by one listener per source, so the caller gets the same single signal
 * either way.
 */
export function anySignal(signals: (AbortSignal | null | undefined)[]): AbortSignal | undefined {
  const sources = signals.filter((signal): signal is AbortSignal => !!signal);
  if (sources.length === 0) {
    return undefined;
  }

  if (sources.length === 1) {
    return sources[0];
  }

  const any = (AbortSignal as unknown as IAbortSignalStatics).any;
  if (typeof any === 'function') {
    return any(sources);
  }

  const controller = new AbortController();
  const aborted = sources.find((signal) => signal.aborted);
  if (aborted) {
    controller.abort(aborted.reason);
  } else {
    for (const source of sources) {
      source.addEventListener('abort', () => controller.abort(source.reason), { once: true });
    }
  }

  return controller.signal;
}

/**
 * Mints the request cancel signal on a Web-standard runtime.
 *
 * A genuine `Request.signal` does mean the client went away, unlike its node namesakes, so it is
 * adopted here rather than re-derived. Extra signals supplied by the caller are folded in alongside
 * it and forward their own abort reason.
 */
export function createWebRequestSignal(
  request?: IWebRequestLike,
  extraSignals?: AbortSignal | AbortSignal[],
): IWebRequestSignal {
  const { cancel, signal } = createCancelSignal();
  const extra =
    extraSignals === undefined ? []
    : Array.isArray(extraSignals) ? extraSignals
    : [extraSignals];

  adopt(request?.signal, () => cancel(CLIENT_DISCONNECTED));

  const composed = anySignal(extra);
  adopt(composed, () => cancel(composed?.reason));

  return { cancel, signal };
}

function adopt(source: AbortSignal | null | undefined, onAbort: () => void): void {
  if (!source) {
    return;
  }

  if (source.aborted) {
    onAbort();

    return;
  }

  source.addEventListener('abort', onAbort, { once: true });
}
