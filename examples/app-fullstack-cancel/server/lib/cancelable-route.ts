import * as canc from '@cancjs/coroutine';
import { isCancelError } from '@cancjs/promise';
import type { NextFunction, Request, Response } from 'express';

/**
 * Wraps a generator route handler as a coroutine and cancels it when the client disconnects. The
 * handler keeps the normal (req, res, next) shape and owns the response; this only adds the
 * cancellation wiring around it. A canceled handler settles with a CancelError, which is swallowed
 * here rather than forwarded to the error middleware.
 */
export function cancAsyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Generator) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const task = canc.async(handler)(req, res, next);

    // listen on res because req close fires as soon as request body is consumed
    res.on('close', () => {
      if (!res.writableEnded) {
        task.cancel('client disconnected');
      }
    });
    // cancel early if socket is already destroyed
    if (req.destroyed) task.cancel('client disconnected');

    task.catch((err: unknown) => {
      if (!isCancelError(err)) next(err);
    });
  };
}
