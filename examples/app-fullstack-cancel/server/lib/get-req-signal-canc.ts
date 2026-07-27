import type { Request, Response } from 'express';
import { createCancelSignal } from '@cancjs/promise';

// Express (and Node's IncomingMessage) does not give you a per-request AbortSignal. This helper
// provides one, on demand. Lazy so a request that never asks for a signal never allocates one, and
// namespaced so it never collides with another library's request property.
//
// The canc handle is a { signal, cancel } pair from createCancelSignal: it aborts with a CancelError
// reason (not a bare DOMException), so a downstream rejection reads as a cancellation through
// isCancelError. Compare get-req-signal-vanilla.ts, which uses a plain AbortController.
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
    req.on('close', () => {
      if (!res.writableEnded) signalHandle!.cancel('client disconnected');
    });
  }
  return signalHandle.signal;
}
