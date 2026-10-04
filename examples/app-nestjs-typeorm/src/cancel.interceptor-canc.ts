import type { IncomingMessage, ServerResponse } from 'node:http';

import { isCancelError } from '@cancjs/promise';
import { getRequestSignal } from '@cancjs/server-express';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, Observable } from 'rxjs';

/**
 * Request-scoped cancellation. The interceptor installs the request's cancel signal before the
 * handler runs; the controller binds its service call to that same signal, so a client that leaves
 * stops the coroutine at its next step instead of finishing work for a dead socket. Nothing is
 * stashed on the request, and the signal is shared, so anything else request-scoped can take it
 * without wiring a second disconnect listener.
 *
 * The signal comes from @cancjs/server-express rather than a hand-rolled listener, which is what
 * gets the disconnect test right: a request's own close event fires as soon as its body has been
 * read, so a POST would otherwise cancel itself on arrival.
 *
 * The interceptor is the one place canc meets RxJS: next.handle() is an Observable, so it is bridged
 * to a promise with lastValueFrom, the CancelError is caught, and the result is handed back as an
 * Observable. The cancel itself lives entirely promise-side; no RxJS operator fights it.
 */
@Injectable()
export class CancelInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<IncomingMessage>();
    const response = context.switchToHttp().getResponse<ServerResponse>();

    // installed here so the listener is wired before the handler starts
    getRequestSignal(request, response);

    // bridge Observable to promise and swallow CancelError on disconnect
    return from(
      lastValueFrom(next.handle()).catch((error: unknown) => {
        if (isCancelError(error)) return undefined;
        throw error;
      }),
    );
  }
}
