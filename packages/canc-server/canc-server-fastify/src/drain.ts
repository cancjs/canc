import { FastifyInstance } from 'fastify';

import { drainServer } from '../../../_server/drain';
import { IDrainOptions, IDrainResult } from '../../../_server/types';

/**
 * Stops a fastify instance gracefully: no new connections, every in-flight handler canceled, and a
 * bounded wait for them to unwind.
 *
 * Takes the fastify instance rather than `app.server` so `app.close()` runs last and every
 * `onClose` hook sees a drained server instead of one still serving requests.
 */
export function drain(app: FastifyInstance, options?: IDrainOptions): Promise<IDrainResult> {
  return drainServer(app.server, options).then(async (result) => {
    await app.close();

    return result;
  });
}
