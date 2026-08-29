import { FastifyInstance } from 'fastify';

import { drainServer } from '../../../_server/drain';
import { IDrainOptions, IDrainResult } from '../../../_server/types';

// keyed on the instance rather than app.server: drainServer already memoizes the part it owns,
// but the app.close() wrapped around it here is this module's own, so it needs its own cache or a
// second call rebuilds the chain and closes the instance twice
const running = new WeakMap<FastifyInstance, Promise<IDrainResult>>();

/**
 * Stops a fastify instance gracefully: no new connections, every in-flight handler canceled, and a
 * bounded wait for them to unwind.
 *
 * Takes the fastify instance rather than `app.server` so `app.close()` runs last and every
 * `onClose` hook sees a drained server instead of one still serving requests. A second call while
 * the first is still running returns that same promise, like the rest of the family.
 */
export function drain(app: FastifyInstance, options?: IDrainOptions): Promise<IDrainResult> {
  const existing = running.get(app);
  if (existing) {
    return existing;
  }

  const result = drainServer(app.server, options).then(
    async (outcome) => {
      try {
        await app.close();
        return outcome;
      } finally {
        running.delete(app);
      }
    },
    (error) => {
      running.delete(app);
      throw error;
    },
  );

  running.set(app, result);

  return result;
}
