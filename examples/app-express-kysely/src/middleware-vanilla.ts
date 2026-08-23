import './report-locals';

import type { NextFunction, Request, Response } from 'express';

/**
 * Installs the AbortController workaround. `res.locals.abortSignal` fires when the client
 * disconnects; the abortable handler must thread it into every step by hand. The uncancelable
 * handler ignores it, which is the point: there is no built-in way to stop that one.
 */
export function abortOnDisconnect(req: Request, res: Response, next: NextFunction): void {
  const controller = new AbortController();

  // Disconnect is the response socket closing, not the request stream ending. `req`'s close fires
  // as soon as the posted body is consumed, which on a streaming response is mid-reply, so listen
  // on `res` and cancel only when the socket closed before the reply finished.
  res.on('close', () => {
    if (!res.writableEnded) {
      controller.abort(new DOMException('client disconnected', 'AbortError'));
    }
  });
  // The socket may already be gone before this handler ran; abort now rather than start work.
  if (req.destroyed) controller.abort(new DOMException('client disconnected', 'AbortError'));

  res.locals.abortSignal = controller.signal;

  next();
}
