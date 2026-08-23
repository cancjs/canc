import type { CancelablePromise } from '@cancjs/promise';

// request interface carrying cancelable promise for interceptor
export interface CancelableRequest {
  cancelable?: CancelablePromise<unknown>;
  on(event: 'close', listener: () => void): unknown;
}
