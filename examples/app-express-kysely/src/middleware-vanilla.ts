import './report-locals';

import type { NextFunction, Request, Response } from 'express';

/**
 * Installs the AbortController workaround. `res.locals.abortSignal` fires when the client
 * disconnects
 */
export function abortOnDisconnect(req: Request, res: Response, next: NextFunction): void {
  const controller = new AbortController();

  // listen on res because req close fires as soon as body is consumed
  res.on('close', () => {
    if (!res.writableEnded) {
      controller.abort(new DOMException('client disconnected', 'AbortError'));
    }
  });

  // abort early if socket was already destroyed before handler ran
  if (req.destroyed) {
    controller.abort(new DOMException('client disconnected', 'AbortError'));
  }

  res.locals.abortSignal = controller.signal;

  next();
}
