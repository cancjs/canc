import { createServerShutdown } from '../../../_server/shutdown';
import { IServerLike, IShutdownOptions, IShutdownResult } from '../../../_server/types';

/**
 * Sets up a graceful shutdown and returns the function that runs it. Call it right after
 * `serve()`: connections and requests are recorded from this call on.
 *
 * The returned function stops the server: no new connections, a grace window for in-flight
 * handlers to finish, and a cancel for any still running when it ends (at once with
 * `cancelAfter: 0`). A connection that has received no bytes is closed once it is five seconds old (or at the grace, if shorter), while one
 * that has already sent part of a request is left to finish. Every in-flight response is sent with
 * `Connection: close`, so each connection closes once its response finishes.
 * It resolves with what happened rather than throwing. A second call while the first is still
 * running returns that same promise, so a pair of signal handlers is safe to wire without a guard.
 * Calling `createShutdown` again with the same server returns the same function.
 *
 * Created late, the shutdown loses nothing but finishes slower, because a connection opened before
 * the call is unknown to it. Such a connection is closed only when `closeAfter` ends if it has
 * sent no request yet, or if its request is still in flight and no wrapped handler or request
 * signal recorded it. That response also goes out without `Connection: close`.
 *
 * Takes what `serve()` returns, typed structurally rather than as `@hono/node-server`'s own
 * `ServerType`: the rest of this package only ever reaches for that dependency at request time, and
 * a type import would still pull it into every consumer's typecheck regardless of runtime, which
 * defeats the point on Cloudflare, Deno and Bun. This is a node affordance either way, since the
 * registry of live requests hangs off the server object and a Web standard runtime hands the
 * application no such object to shut down.
 */
export function createShutdown(server: IServerLike): (options?: IShutdownOptions) => Promise<IShutdownResult> {
  return createServerShutdown(server);
}
