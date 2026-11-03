import { FastifyInstance } from 'fastify';

import { getShutdownFunction, setShutdownFunction } from '../../../_server/holder';
import { createServerShutdown, DEFAULT_SHUTDOWN_TIMEOUT } from '../../../_server/shutdown';
import { IServerLike, IShutdownOptions, IShutdownResult } from '../../../_server/types';

// key the drain fastify's own close runs is configured under, on the instance's http.Server: the
// plugin and createShutdown may come from different copies of this code and from different
// encapsulation scopes, and the server is the one object they all share
const CLOSE_DRAIN = Symbol.for('@cancjs/server-fastify:CloseDrain');

interface ICloseDrain {
  // set once the preClose hook that runs the drain is registered
  hooked?: boolean;
  // options stored by createShutdown(app, options), used by a plain app.close()
  options?: IShutdownOptions;
  // set once the windows were lowered to fit pluginTimeout and that was logged
  warned?: boolean;
}

const ALREADY_STARTED = 'FST_ERR_INSTANCE_ALREADY_LISTENING';
// room left under pluginTimeout for fastify to end the close after the windows run out
const PLUGIN_TIMEOUT_MARGIN = 500;

function getCloseDrain(server: IServerLike): ICloseDrain {
  const keyed = server as unknown as Record<symbol, ICloseDrain | undefined>;
  let drain = keyed[CLOSE_DRAIN];

  if (!drain) {
    drain = {};
    Object.defineProperty(server, CLOSE_DRAIN, { configurable: true, value: drain, writable: true });
  }

  return drain;
}

function usableMs(ms: number | undefined): number | undefined {
  return ms === undefined || ms !== ms ? undefined : Math.max(0, ms);
}

// fastify cuts a preClose hook off at pluginTimeout and rejects the close, so the windows are
// lowered to end inside it; a reversed pair is left alone for the shutdown to reject
function fitPluginTimeout(
  instance: FastifyInstance,
  drain: ICloseDrain,
  options: IShutdownOptions | undefined,
): IShutdownOptions | undefined {
  const limit = instance.initialConfig.pluginTimeout;
  if (typeof limit !== 'number' || !(limit > 0) || limit === Infinity) {
    return options;
  }

  const cancelAt = usableMs(options?.cancelAfter);
  const closeAt = usableMs(options?.closeAfter);
  if (cancelAt !== undefined && closeAt !== undefined && cancelAt > closeAt) {
    return options;
  }

  const closeAfter = closeAt ?? (cancelAt ?? DEFAULT_SHUTDOWN_TIMEOUT) + 1000;
  const cap = limit - Math.min(PLUGIN_TIMEOUT_MARGIN, Math.floor(limit / 10));
  if (closeAfter <= cap) {
    return options;
  }

  const cancelAfter = cancelAt === undefined ? Math.max(0, cap - 1000) : Math.min(cancelAt, cap);
  if (!drain.warned) {
    drain.warned = true;
    instance.log.warn(
      { cancelAfter, closeAfter: cap, pluginTimeout: limit },
      '[@cancjs/server-fastify] shutdown windows lowered to end inside pluginTimeout',
    );
  }

  return { ...options, cancelAfter, closeAfter: cap };
}

/**
 * Registers the `preClose` hook that runs the server drain inside fastify's own close, once per
 * server. Returns false when the instance has already started and takes no more hooks.
 */
export function installCloseDrain(instance: FastifyInstance): boolean {
  const server = instance.server as IServerLike;
  const drain = getCloseDrain(server);

  if (drain.hooked) {
    return true;
  }

  // created now so connections are tracked from registration, not from the close
  const shutdownServer = createServerShutdown(server);

  try {
    instance.addHook('preClose', async function drainOnClose() {
      // a shutdown() call already started it, and the server part hands back that same run
      await shutdownServer(fitPluginTimeout(instance, drain, drain.options));
    });
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === ALREADY_STARTED) {
      return false;
    }

    throw error;
  }

  drain.hooked = true;

  return true;
}

/**
 * Sets up a graceful shutdown for a fastify instance and returns the function that runs it.
 *
 * With `cancelPlugin` registered, or with this called before `app.listen()`, the drain runs inside
 * fastify's own close as a `preClose` hook, so a plain `await app.close()` drains too. `options`
 * here are then what that close uses, and the returned function runs `app.close()` with its own
 * options laid over them. Hooks run in registration order, so a `preClose` hook registered ahead
 * of the drain (one that ends websockets, say) runs when the close starts, and one registered after
 * it waits for the drain. A request arriving on a kept-alive connection during the close is
 * answered by fastify, with 503 unless `return503OnClosing` is false. Fastify cuts a `preClose` hook
 * off at `pluginTimeout` (10 s by default), which the default windows would pass, so there the
 * windows are lowered to end just inside it, and that is logged once through `app.log.warn`.
 *
 * The drain stops the server: no new connections, a window for in-flight handlers to finish, and
 * a cancel for any still running when `cancelAfter` ends (at once with `cancelAfter: 0`). Every
 * in-flight response is sent with `Connection: close`, so each connection closes once its response
 * finishes. The function resolves with what happened rather than throwing. A second call while the
 * first is still running returns that same promise, so a pair of signal handlers is safe to wire
 * without a guard. Calling `createShutdown` again with the same instance returns the same function.
 *
 * With `closeServer: false` only the drain runs, and the instance is not closed. A hook failing in
 * `app.close()` is logged and the outcome is still returned.
 *
 * Fastify takes no hook once the instance has started. Created after `app.listen()` without the
 * plugin, the function drains first and then runs `app.close()`, so a late request on a kept-alive
 * connection is served instead of refused. The options given here apply on that path too. Connections and requests are recorded from the call on,
 * so a connection opened before it is closed only when `closeAfter` ends if it has sent no request
 * yet, or if its request is still in flight and no wrapped handler recorded it. That response also
 * goes out without `Connection: close`.
 */
export function createShutdown(
  app: FastifyInstance,
  options?: IShutdownOptions,
): (options?: IShutdownOptions) => Promise<IShutdownResult> {
  // a fastify instance is a function with properties, so both types are accepted; anything else
  // would fail on app.server with a raw TypeError that names no argument
  if (app === null || (typeof app !== 'object' && typeof app !== 'function')) {
    throw new TypeError(
      `createShutdown() needs the fastify instance as its first argument, got ${app === null ? 'null' : typeof app}.`,
    );
  }

  const drain = getCloseDrain(app.server as IServerLike);
  if (options !== undefined) {
    drain.options = options;
  }

  const cached = getShutdownFunction(app);
  if (cached) {
    return cached;
  }

  const shutdownServer = createServerShutdown(app.server);
  const insideClose = installCloseDrain(app);
  // the server part memoizes itself, but the app.close() chained on here is this layer's own, and
  // rebuilding it on a second call would close the instance twice
  let running: Promise<IShutdownResult> | undefined;

  const closeApp = async (): Promise<void> => {
    try {
      await app.close();
    } catch (error) {
      // the drain outcome is what the caller needs, and a failing onClose hook cannot undo it
      app.log.error({ err: error }, '[@cancjs/server-fastify] closing the instance failed');
    }
  };

  const shutdown = (callOptions?: IShutdownOptions): Promise<IShutdownResult> => {
    if (running) {
      return running;
    }

    const merged = { ...drain.options, ...callOptions };
    // started here rather than in the hook, so a bad option throws to the caller before the close
    const drained = shutdownServer(
      insideClose && merged.closeServer !== false ? fitPluginTimeout(app, drain, merged) : merged,
    );
    let result: Promise<IShutdownResult>;

    if (merged?.closeServer === false) {
      result = drained;
    } else if (insideClose) {
      result = closeApp().then(() => drained);
    } else {
      result = drained.then(async (outcome) => {
        await closeApp();

        return outcome;
      });
    }

    const settled = result.then(
      (outcome) => {
        running = undefined;

        return outcome;
      },
      (error) => {
        running = undefined;
        throw error;
      },
    );

    running = settled;

    return settled;
  };

  setShutdownFunction(app, shutdown);

  return shutdown;
}
