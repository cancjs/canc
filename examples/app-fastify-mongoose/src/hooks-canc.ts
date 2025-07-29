import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { CancelablePromise } from '@cancjs/promise';

// Per-request cancellation wiring. When the client drops the connection, the raw request emits
// `close`; if it aborted before the reply was sent, the client left early. The handler hands its
// in-flight CancelablePromise to `cancelOnClose`, which cancels it on that event.
// fastify-plugin lifts the decorator into the parent scope so routes can use it.
export const cancellationPlugin = fp(async function (app: FastifyInstance): Promise<void> {
 app.decorateRequest('cancelOnClose', function <T>(
 this: FastifyRequest,
 work: CancelablePromise<T>
 ): CancelablePromise<T> {
 this.raw.on('close', () => {
 if (this.raw.aborted) work.cancel('client disconnected');
 });
 return work;
 });
});

declare module 'fastify' {
 interface FastifyRequest {
 cancelOnClose<T>(work: Promise<T>): Promise<T>;
 }
}
