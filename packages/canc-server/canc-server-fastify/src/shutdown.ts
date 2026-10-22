import { FastifyInstance } from 'fastify';

import { getShutdownFunction, setShutdownFunction } from '../../../_server/holder';
import { createServerShutdown } from '../../../_server/shutdown';
import { IShutdownOptions, IShutdownResult } from '../../../_server/types';

/**
 * Sets up a graceful shutdown for a fastify instance and returns the function that runs it. Call it
 * right after `app.listen()`: connections and requests are recorded from this call on.
 *
 * The returned function stops the instance: no new connections, a grace window for in-flight
 * handlers to finish, and a cancel for any still running when it ends (at once with
 * `cancelOnStart`). When it starts, a connection that has received no bytes is closed, while one
 * that has already sent part of a request is left to finish. Every in-flight response is sent with
 * `Connection: close`, so each connection closes once its response finishes.
 * It resolves with what happened rather than throwing. A second call while the first is still
 * running returns that same promise, so a pair of signal handlers is safe to wire without a guard.
 * Calling `createShutdown` again with the same instance returns the same function.
 *
 * Takes the fastify instance rather than `app.server` so `app.close()` runs last and every
 * `onClose` hook sees a server already shut down instead of one still serving requests. With
 * `closeServer: false` the instance is not closed either, so the caller keeps its lifecycle. A hook
 * failing in `app.close()` is logged and the outcome is still returned.
 *
 * Created late, the shutdown loses nothing but drains slower, because a connection opened before
 * the call is unknown to it. Such a connection is closed only when the grace window ends if it has
 * sent no request yet, or if its request is still in flight and no wrapped handler or the plugin
 * recorded it. That response also goes out without `Connection: close`.
 */
export function createShutdown(app: FastifyInstance): (options?: IShutdownOptions) => Promise<IShutdownResult> {
  // a fastify instance is a function with properties, so both types are accepted; anything else
  // would fail on app.server with a raw TypeError that names no argument
  if (app === null || (typeof app !== 'object' && typeof app !== 'function')) {
    throw new TypeError(
      `createShutdown() needs the fastify instance as its first argument, got ${app === null ? 'null' : typeof app}.`,
    );
  }

  const cached = getShutdownFunction(app);
  if (cached) {
    return cached;
  }

  const shutdownServer = createServerShutdown(app.server);
  // the server part memoizes itself, but the app.close() chained on here is this layer's own, and
  // rebuilding it on a second call would close the instance twice
  let running: Promise<IShutdownResult> | undefined;

  const shutdown = (options?: IShutdownOptions): Promise<IShutdownResult> => {
    if (running) {
      return running;
    }

    const result = shutdownServer(options).then(
      async (outcome) => {
        try {
          if (options?.closeServer !== false) {
            await app.close();
          }
        } catch (error) {
          // the drain outcome is what the caller needs, and a failing onClose hook cannot undo it
          console.error('[@cancjs/server-fastify] closing the instance failed', error);
        } finally {
          running = undefined;
        }

        return outcome;
      },
      (error) => {
        running = undefined;
        throw error;
      },
    );

    running = result;

    return result;
  };

  setShutdownFunction(app, shutdown);

  return shutdown;
}
