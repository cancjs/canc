import type { Request, Response, NextFunction } from 'express';
import type { CancelablePromise } from '@cancjs/promise';
import './report-locals';

/**
 * Installs per-request cancellation. `res.locals.run` wraps a unit of work as a cancelable op and
 * remembers it; when the client disconnects, the op is canceled, so the handler chain stops at its
 * next step instead of computing for a dead socket. No signal is threaded through the handler.
 */
export function cancelOnDisconnect(req: Request, res: Response, next: NextFunction): void {
 let inFlight: CancelablePromise<unknown> | undefined;

 req.on('close', () => {
 if (!res.writableEnded) {
 void inFlight?.cancel('client disconnected');
 }
 });

 res.locals.run = <T>(work: () => CancelablePromise<T>): CancelablePromise<T> => {
 const promise = work();
 inFlight = promise;
 return promise;
 };

 next();
}
