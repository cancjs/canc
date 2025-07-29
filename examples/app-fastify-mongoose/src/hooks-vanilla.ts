import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

// (no cancellation counterpart, see hooks-canc.ts)
// Plain promises have nothing to cancel, so there is no per-request wiring here. The close
// event still fires when the client leaves, but the handler's work cannot be stopped, so
// listening for it would change nothing.
export const cancellationPlugin = fp(async function (app: FastifyInstance): Promise<void> {
 app.decorateRequest('cancelOnClose', function <T>(
 this: FastifyRequest,
 work: Promise<T>
 ): Promise<T> {
 // returns the work untouched, a dropped connection cannot stop it
 return work;
 });
});

declare module 'fastify' {
 interface FastifyRequest {
 cancelOnClose<T>(work: Promise<T>): Promise<T>;
 }
}
