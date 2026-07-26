import type { Request, Response } from 'express';
import { createCancelSignal } from '@cancjs/promise';

// Express (and Node's IncomingMessage) does not give you a per-request AbortSignal. This helper
// provides one, on demand. It is the low-level primitive the request-context middleware builds on
// and the seed of a future canc express plugin.
//
// Namespaced so it never collides with another library's request property, and lazy so a request
// that never asks for a signal never allocates a controller.
const SIGNAL_HANDLE = Symbol.for('canc.request.signalHandle');

interface SignalHandle {
  signal: AbortSignal;
  cancel: (reason?: unknown) => void;
}

/**
 * The request's AbortSignal, created on first use. It aborts when the client disconnects, with a
 * CancelError reason (not a bare DOMException), so a downstream rejection reads as a cancellation
 * through isCancelError.
 */
export function getReqSignal(req: Request, res: Response): AbortSignal {
  const holder = req as unknown as Record<symbol, SignalHandle | undefined>;
  let signalHandle = holder[SIGNAL_HANDLE];
  if (!signalHandle) {
    signalHandle = createCancelSignal();
    holder[SIGNAL_HANDLE] = signalHandle;
    req.on('close', () => {
      if (!res.writableEnded) signalHandle!.cancel('client disconnected');
    });
  }
  return signalHandle.signal;
}
