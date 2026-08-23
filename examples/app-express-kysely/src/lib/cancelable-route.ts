import * as canc from '@cancjs/coroutine';
import { isCancelError } from '@cancjs/promise';
import type { NextFunction, Request, Response } from 'express';

/**
 * Wraps a generator route handler as a canc.async coroutine and cancels it when the client
 * disconnects. The handler keeps the normal `(req, res, next)` shape and owns the response;
 * this only adds the cancellation wiring around it.
 */
export function cancAsyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Generator) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const task = canc.async(handler)(req, res, next);

    // Disconnect is the response socket closing, not the request stream ending. `req`'s close fires
    // as soon as the posted body is consumed, which on a streaming response is mid-reply, so listen
    // on `res` and cancel only when the socket closed before the reply finished.
    res.on('close', () => {
      if (!res.writableEnded) {
        task.cancel('client disconnected');
      }
    });
    // The socket may already be gone before this handler ran; cancel now rather than start work.
    if (req.destroyed) task.cancel('client disconnected');

    task.catch((err: unknown) => {
      if (!isCancelError(err)) next(err);
    });
  };
}
