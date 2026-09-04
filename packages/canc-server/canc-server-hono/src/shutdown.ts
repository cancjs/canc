import { shutdownServer } from '../../../_server/shutdown';
import { IServerLike, IShutdownOptions, IShutdownResult } from '../../../_server/types';

/**
 * Stops a server gracefully: no new connections, every in-flight handler canceled, and a bounded
 * wait for them to unwind. Resolves with what happened rather than throwing, and a second call
 * while the first is still running returns that same result, so a pair of signal handlers is safe
 * to wire without a guard.
 *
 * Takes what `serve()` returns, typed structurally rather than as `@hono/node-server`'s own
 * `ServerType`: the rest of this package only ever reaches for that dependency at request time, and
 * a type import would still pull it into every consumer's typecheck regardless of runtime, which
 * defeats the point on Cloudflare, Deno and Bun. This is a node affordance either way, since the
 * registry of live requests hangs off the server object and a Web standard runtime hands the
 * application no such object to shut down.
 */
export function shutdown(server: IServerLike, options?: IShutdownOptions): Promise<IShutdownResult> {
  return shutdownServer(server, options);
}
