import type { Request, Response } from 'express';
import { createCancelSignal } from '@cancjs/promise';

// Express (and Node's IncomingMessage) does not give you a per-request AbortSignal. This helper
// provides one, on demand. It is the low-level primitive the higher-level middleware builds on and
// the seed of a future canc express plugin.
//
// Namespaced so it never collides with another library's request property, and lazy so a request
// that never asks for a signal never allocates an AbortController.
const SIGNAL_SLOT = Symbol.for('canc.request.signal');

interface SignalSlot {
  signal: AbortSignal;
  cancel: (reason?: unknown) => void;
}

/**
 * The request's AbortSignal, created on first use. It aborts when the client disconnects, with a
 * CancelError reason (not a bare DOMException), so a downstream rejection reads as a cancellation
 * through isCancelError.
 */
export function reqSignal(req: Request, res: Response): AbortSignal {
  const holder = req as unknown as Record<symbol, SignalSlot | undefined>;
  let slot = holder[SIGNAL_SLOT];
  if (!slot) {
    slot = createCancelSignal();
    holder[SIGNAL_SLOT] = slot;
    req.on('close', () => {
      if (!res.writableEnded) slot!.cancel('client disconnected');
    });
  }
  return slot.signal;
}
