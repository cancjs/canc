import { createCancelSignal } from '@cancjs/promise';
import type { Request, Response } from 'express';

/**
 * Express does not give you a per-request AbortSignal. This helper provides one on demand.
 * Lazy and cached per request.
 *
 * The canc handle is a { signal, cancel } pair from createCancelSignal: it aborts with a CancelError
 * so downstream can distinguish client disconnects via isCancelError.
 */
const SIGNAL_HANDLE = Symbol.for('canc.request.signalHandle');

interface SignalHandle {
  signal: AbortSignal;
  cancel: (reason?: unknown) => void;
}

export function getReqSignal(req: Request, res: Response): AbortSignal {
  const holder = req as unknown as Record<symbol, SignalHandle | undefined>;
  let signalHandle = holder[SIGNAL_HANDLE];
  if (!signalHandle) {
    signalHandle = createCancelSignal();
    holder[SIGNAL_HANDLE] = signalHandle;
    // listen on res because req close fires as soon as request body is consumed
    res.on('close', () => {
      if (!res.writableEnded) signalHandle!.cancel('client disconnected');
    });
    // cancel early if socket is already destroyed
    if (req.destroyed) signalHandle.cancel('client disconnected');
  }
  return signalHandle.signal;
}
