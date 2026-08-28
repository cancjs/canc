import type { ServerType } from '@hono/node-server';

import { drainServer } from '../../../_server/drain';
import { IDrainOptions, IDrainResult, IServerLike } from '../../../_server/types';

/**
 * Stops a server gracefully: no new connections, every in-flight handler canceled, and a bounded
 * wait for them to unwind. Resolves with what happened rather than throwing, and a second call
 * while the first is still running returns that same result, so a pair of signal handlers is safe
 * to wire without a guard.
 *
 * Takes what `serve()` returns. This is a node affordance: the registry of live requests hangs off
 * the server object, and a Web standard runtime hands the application no such object, so there is
 * nothing to drain there.
 */
export function drain(server: ServerType, options?: IDrainOptions): Promise<IDrainResult> {
  return drainServer(server as IServerLike, options);
}
