import type { Request, Response, NextFunction } from 'express';
import { isCancelError } from '@cancjs/promise';
import { cancAsync } from '@cancjs/coroutine';

/**
 * Wraps a generator route handler as a cancAsync coroutine and cancels it when the client
 * disconnects. The handler keeps the normal `(req, res, next)` shape and owns the response;
 * this only adds the cancellation wiring around it.
 */
export function cancAsyncRoute(
 handler: (req: Request, res: Response, next: NextFunction) => Generator,
) {
 return (req: Request, res: Response, next: NextFunction): void => {
 const task = cancAsync(handler)(req, res, next);

 req.on('close', () => {
 if (!res.writableEnded) {
 task.cancel('client disconnected');
 }
 });

 task.catch((err: unknown) => {
 if (!isCancelError(err)) next(err);
 });
 };
}
