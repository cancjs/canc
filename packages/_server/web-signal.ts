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

/**
 * Mints the request cancel signal on a Web-standard runtime.
 *
 * A genuine `Request.signal` does mean the client went away, unlike its node namesakes, so it is
 * adopted here rather than re-derived.
 */
export function createWebRequestSignal(request?: IWebRequestLike): IWebRequestSignal {
  const { cancel, signal } = createCancelSignal();

  // callers compose multiple signals through promise options signal array instead
  adopt(request?.signal, () => cancel(CLIENT_DISCONNECTED));

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
