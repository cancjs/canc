import { cancAsync } from '@cancjs/coroutine';
import { isCancelError } from '@cancjs/promise';
import { NextFunction, Request, Response } from 'express';

/**
 * Wraps a generator route handler as a `cancAsync` coroutine and cancels it when the client
 * disconnects before the response is finished. The handler keeps full control over `req`/`res`,
 * including writing the response itself; this only adds the cancellation wiring around it.
 *
 * A client that has already gone away by the time the handler starts (a request destroyed before
 * dispatch) cancels immediately, so no work runs for a dead socket.
 *
 * Copy this file into an app that needs the same wiring; it has no example-specific dependencies.
 */
export function cancAsyncRoute(handler: (req: Request, res: Response) => Generator) {
  return (req: Request, res: Response, next: NextFunction) => {
    const task = cancAsync(handler)(req, res);

    // Disconnect is the response socket closing, not the request stream ending. `req`'s close fires
    // as soon as the posted body is consumed, which on a streaming response is mid-reply, so listen
    // on `res` and cancel only when the socket closed before the reply finished.
    res.on('close', () => {
      if (!res.writableEnded) task.cancel('client disconnected');
    });
    // The socket may already be gone before this handler ran; cancel now rather than start work.
    if (req.destroyed) task.cancel('client disconnected');

    task.then(
      () => undefined,
      (err) => {
        if (isCancelError(err)) return; // canceled here, the client already left
        next(err);
      },
    );
  };
}
