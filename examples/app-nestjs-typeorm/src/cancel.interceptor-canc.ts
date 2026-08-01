import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, Observable } from 'rxjs';

import type { CancelableRequest } from './cancelable-request';

/**
 * Request-scoped cancellation. Every canc handler returns its cancelable service call and leaves the
 * same promise on the request. The interceptor holds no plumbing the handler has to call: it just
 * reads that promise when the client disconnects and cancels it, so the coroutine stops at its next
 * step instead of finishing work for a dead socket. Nest awaits the returned cancelable promise like
 * any promise, because a CancelablePromise is a native Promise subclass.
 *
 * The interceptor is the one place canc meets RxJS: next.handle() is an Observable, so we bridge it
 * to a promise with lastValueFrom, catch the CancelError, and hand the result back as an Observable.
 * The cancel itself lives entirely promise-side; no RxJS operator fights it.
 */
@Injectable()
export class CancelInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<CancelableRequest>();
    const response = context.switchToHttp().getResponse();

    // Express fires 'close' on the request when the socket goes away (on Fastify it is
    // request.raw.on('close')). response.writableEnded stays false only while the response is open.
    request.on('close', () => {
      if (!response.writableEnded) {
        void (request.cancelable as CancelablePromise<unknown> | undefined)?.cancel('client disconnected');
      }
    });

    // Bridge the handler Observable to a promise, then swallow a CancelError so a disconnect does
    // not surface as a 500; the socket is already gone.
    return from(
      lastValueFrom(next.handle()).catch((error: unknown) => {
        if (isCancelError(error)) return undefined;
        throw error;
      }),
    );
  }
}
