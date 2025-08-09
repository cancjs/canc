import {
 CallHandler,
 ExecutionContext,
 Injectable,
 NestInterceptor,
} from '@nestjs/common';
import { Observable, from, lastValueFrom } from 'rxjs';
import { CancelablePromise, isCancelError } from '@cancjs/promise';
import type { CancelableRequest } from './request-run';

/**
 * Request-scoped cancellation. The interceptor installs a `run` hook on the request before the
 * handler runs; the controller wraps its cancelable service call in that hook, which remembers the
 * in-flight promise. When the client disconnects, the interceptor cancels it, so the coroutine
 * stops at its next step instead of finishing work for a dead socket. The controller handler
 * returns a cancelable promise, which Nest awaits like any promise because CancelablePromise is a
 * native Promise subclass.
 *
 * The interceptor is the one place canc meets RxJS: `next.handle()` is an Observable, so we bridge
 * it to a promise with lastValueFrom, catch the CancelError, and hand the result back as an
 * Observable. The cancel itself lives entirely promise-side; no RxJS operator fights it.
 */
@Injectable()
export class CancelInterceptor implements NestInterceptor {
 intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
 const request = context.switchToHttp().getRequest<CancelableRequest>();
 const response = context.switchToHttp().getResponse();

 let inFlight: CancelablePromise<unknown> | undefined;
 request.run = <T>(work: () => CancelablePromise<T>): CancelablePromise<T> => {
 const promise = work();
 inFlight = promise;
 return promise;
 };

 // Express fires 'close' on the request when the socket goes away (on Fastify it is
 // request.raw.on('close')). res.writableEnded stays false only while the response is still open.
 request.on('close', () => {
 if (!response.writableEnded) {
 void inFlight?.cancel('client disconnected');
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
