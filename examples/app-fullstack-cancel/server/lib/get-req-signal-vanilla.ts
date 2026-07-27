import type { Request, Response } from 'express';

// Express (and Node's IncomingMessage) does not give you a per-request AbortSignal. This helper
// provides one, on demand. Lazy so a request that never asks for a signal never allocates one, and
// namespaced so it never collides with another library's request property.
//
// The vanilla handle is a plain AbortController, the { signal, abort } analogue of the canc pair.
// Its abort reason is a bare DOMException, so downstream code checks error.name, not isCancelError.
// Compare get-req-signal-canc.ts, which uses createCancelSignal.
const SIGNAL_HANDLE = Symbol.for('canc.request.signalHandle');

export function getReqSignal(req: Request, res: Response): AbortSignal {
  const holder = req as unknown as Record<symbol, AbortController | undefined>;
  let signalHandle = holder[SIGNAL_HANDLE];
  if (!signalHandle) {
    signalHandle = new AbortController();
    holder[SIGNAL_HANDLE] = signalHandle;
    req.on('close', () => {
      if (!res.writableEnded) signalHandle!.abort();
    });
  }
  return signalHandle.signal;
}
