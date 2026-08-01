import type { CancelablePromise } from '@cancjs/promise';

// Each canc handler returns its cancelable work and leaves the same promise on the request, so the
// interceptor can cancel it when the client disconnects. Both twins share this shape; the vanilla
// request simply never gets `cancelable` set.
export interface CancelableRequest {
  cancelable?: CancelablePromise<unknown>;
  on(event: 'close', listener: () => void): unknown;
}
