import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * The vanilla interceptor is a passthrough: it has no way to stop the handler once it starts. If
 * the client disconnects mid-request, the controller chain keeps running to the end and the
 * finished result is written to a socket nobody is reading.
 *
 * The handler leaves nothing cancelable on the request, so the RxJS bridge the canc twin needs has
 * no counterpart; the handler's Observable is returned unchanged.
 */
@Injectable()
export class CancelInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // (nothing cancelable on request, see -canc)
    const response = context.switchToHttp().getResponse();
    response.on('close', () => {
      if (!response.writableEnded) {
        // client left, but plain promise chain cannot be aborted
      }
    });

    return next.handle();
  }
}
