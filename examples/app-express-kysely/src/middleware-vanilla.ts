import type { Request, Response, NextFunction } from 'express';
import './report-locals';

/**
 * Installs the AbortController workaround. `res.locals.abortSignal` fires when the client
 * disconnects; the abortable handler must thread it into every step by hand. The uncancelable
 * handler ignores it, which is the point: there is no built-in way to stop that one.
 */
export function abortOnDisconnect(req: Request, res: Response, next: NextFunction): void {
 const controller = new AbortController();

 req.on('close', () => {
 if (!res.writableEnded) {
 controller.abort(new DOMException('client disconnected', 'AbortError'));
 }
 });

 res.locals.abortSignal = controller.signal;

 next();
}
