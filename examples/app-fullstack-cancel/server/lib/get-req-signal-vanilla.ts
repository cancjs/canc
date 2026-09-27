import type { Request, Response } from 'express';

/**
 * Express does not give you a per-request AbortSignal. This helper provides one on demand.
 * Lazy and cached per request.
 *
 * The vanilla handle is a plain AbortController.
 * Its abort reason is a bare DOMException, so downstream code checks error.name, not isCancelError.
 */
const SIGNAL_HANDLE = Symbol.for('canc.request.signalHandle');

export function getReqSignal(req: Request, res: Response): AbortSignal {
  const holder = req as unknown as Record<symbol, AbortController | undefined>;
  let signalHandle = holder[SIGNAL_HANDLE];
  if (!signalHandle) {
    signalHandle = new AbortController();
    holder[SIGNAL_HANDLE] = signalHandle;
    // listen on res because req close fires as soon as request body is consumed
    res.on('close', () => {
      if (!res.writableEnded) signalHandle!.abort();
    });
    // abort early if socket is already destroyed
    if (req.destroyed) signalHandle.abort();
  }
  return signalHandle.signal;
}
