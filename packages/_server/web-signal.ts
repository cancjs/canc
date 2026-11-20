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
  /** Stops listening to the request's own signal. Called once the minted signal aborts. */
  release: () => void;
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
  const release = adopt(request?.signal, () => cancel(CLIENT_DISCONNECTED));

  // the source has nothing left to tell a canceled request
  if (!signal.aborted) {
    signal.addEventListener('abort', release, { once: true });
  }

  return { cancel, release, signal };
}

function adopt(source: AbortSignal | null | undefined, onAbort: () => void): () => void {
  if (!source) {
    return noop;
  }

  if (source.aborted) {
    onAbort();

    return noop;
  }

  source.addEventListener('abort', onAbort, { once: true });

  return () => source.removeEventListener('abort', onAbort);
}

function noop(): void {
  /**/
}
