import type { CancelablePromise } from '@cancjs/promise';

// The cancel interceptor puts a `run` hook on the request; the controller uses it to register the
// in-flight cancelable promise so a client disconnect can cancel it. Both twins share this shape so
// the controller can stay flavor-blind (the vanilla request simply never has `run` set).
export interface CancelableRequest {
 run?: <T>(work: () => CancelablePromise<T>) => CancelablePromise<T>;
 on(event: 'close', listener: () => void): unknown;
}
