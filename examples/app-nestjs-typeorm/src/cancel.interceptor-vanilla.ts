import {
 CallHandler,
 ExecutionContext,
 Injectable,
 NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * The vanilla interceptor is a passthrough: it has no way to stop the handler once it starts. If
 * the client disconnects mid-request, the controller chain keeps running to the end and the
 * finished result is written to a socket nobody is reading.
 *
 * There is no promise-side cancel root to build here, so the RxJS bridge the canc twin needs has
 * no counterpart; the handler's Observable is returned unchanged.
 */
@Injectable()
export class CancelInterceptor implements NestInterceptor {
 intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
 const request = context.switchToHttp().getRequest();

 // (no cancelable root — see -canc; the handler runs to completion regardless of the client)

 // (no cancellation counterpart — see -canc; a disconnect cannot stop the handler chain)
 const response = context.switchToHttp().getResponse();
 request.on('close', () => {
 if (!response.writableEnded) {
 // client left, but nothing below can act on it — the handler already runs to the end
 }
 });

 return next.handle();
 }
}
