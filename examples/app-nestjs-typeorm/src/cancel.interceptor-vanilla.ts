import type { ServerResponse } from 'node:http';

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * The vanilla interceptor is a passthrough: it has no way to stop the handler once it starts. If
 * the client disconnects mid-request, the controller chain keeps running to the end and the
 * finished result is written to a socket nobody is reading.
 *
 * The handler binds nothing to the disconnect, so the RxJS bridge the canc twin needs has no
 * counterpart; the handler's Observable is returned unchanged.
 */
@Injectable()
export class CancelInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // (no request signal to install, see -canc)
    const response = context.switchToHttp().getResponse<ServerResponse>();

    // listen on the response, because a request close fires as soon as the body is consumed
    response.on('close', () => {
      if (!response.writableEnded) {
        // client left, but a plain promise chain cannot be aborted
      }
    });

    return next.handle();
  }
}
