import { FastifyInstance } from 'fastify';

import { shutdownServer } from '../../../_server/shutdown';
import { IShutdownOptions, IShutdownResult } from '../../../_server/types';

// keyed on the instance rather than app.server: shutdownServer already memoizes the part it owns,
// but the app.close() wrapped around it here is this module's own, so it needs its own cache or a
// second call rebuilds the chain and closes the instance twice
const running = new WeakMap<FastifyInstance, Promise<IShutdownResult>>();

/**
 * Stops a fastify instance gracefully: no new connections, every in-flight handler canceled, and a
 * bounded wait for them to unwind.
 *
 * Takes the fastify instance rather than `app.server` so `app.close()` runs last and every
 * `onClose` hook sees a server already shut down instead of one still serving requests. A second
 * call while the first is still running returns that same promise, like the rest of the family.
 *
 * With `closeServer: false` the instance is not closed either, so the caller keeps its lifecycle. A hook
 * failing in `app.close()` is logged and the outcome is still returned.
 */
export function shutdown(app: FastifyInstance, options?: IShutdownOptions): Promise<IShutdownResult> {
  // a fastify instance is a function with properties, so both types are accepted; anything else
  // would fail on app.server with a raw TypeError that names no argument
  if (app === null || (typeof app !== 'object' && typeof app !== 'function')) {
    throw new TypeError(
      `shutdown() needs the fastify instance as its first argument, got ${app === null ? 'null' : typeof app}.`,
    );
  }

  const existing = running.get(app);
  if (existing) {
    return existing;
  }

  const result = shutdownServer(app.server, options).then(
    async (outcome) => {
      try {
        if (options?.closeServer !== false) {
          await app.close();
        }
      } catch (error) {
        // the drain outcome is what the caller needs, and a failing onClose hook cannot undo it
        console.error('[@cancjs/server-fastify] closing the instance failed', error);
      } finally {
        running.delete(app);
      }

      return outcome;
    },
    (error) => {
      running.delete(app);
      throw error;
    },
  );

  running.set(app, result);

  return result;
}
