import { CancelablePromise, isCancelError, resolvePromiseImpl } from '@cancjs/promise';

import { isFunction } from '../_util';
import { hasClientLeft } from './exchange';
import {
  clearShutdownState,
  getRequestRegistry,
  getRequestState,
  getShutdownState,
  IRequestCancelState,
  setShutdownState,
} from './holder';
import { ensureRequestCancelState, isResponseClosed } from './node-signal';
import { SERVER_SHUTDOWN } from './reasons';
import { MAX_TIMER_MS } from './timeout';
import { IRequestLike, IResponseLike, IServerLike, IShutdownOptions, IShutdownResult } from './types';

/** Grace window a shutdown waits for in-flight requests before it gives up. */
export const DEFAULT_SHUTDOWN_TIMEOUT = 10_000;

interface IDrainResponse extends IResponseLike {
  headersSent?: boolean;
  setHeader?: (name: string, value: string) => unknown;
  socket?: unknown;
}

interface ISocketLike {
  destroyed?: boolean;
  destroySoon?: () => void;
  end?: () => unknown;
}

/** One request a shutdown waits on, counted once its response is over and its tasks settled. */
interface IDrain {
  outstanding: number;
  wasCanceled: boolean;
  over: boolean;
  counted: boolean;
}

/**
 * Stops a server gracefully: no new connections, every in-flight request canceled, and a bounded
 * wait for their responses to finish.
 *
 * The wait is on responses, not on handler tasks, so a route this layer never wrapped still gets to
 * answer inside the grace window. Every response sent from here on carries `Connection: close`, and
 * each connection is closed as soon as the response on it finishes. Connections still busy when the
 * window runs out are force-closed. A request arriving on a kept-alive connection while the shutdown
 * runs is canceled on arrival and answered with `Connection: close`.
 *
 * Requests are seen from the first time this layer meets the server: the first wrapped handler or
 * request signal on it, the fastify plugin, or the shutdown itself. A connection opened before that
 * and idle when the window runs out is closed then.
 *
 * Each request's own cancel signal is canceled as well, once its tasks have been. That stops the
 * consumers a handler never awaited, such as a detached query or a request-scoped database
 * context, which would otherwise run on through shutdown. Counts are per request: one whose
 * handler was canceled or whose client left counts as canceled, any other whose response finished
 * counts as completed.
 *
 * Resolves with what happened rather than throwing, so a shutdown path has one thing to log. A
 * second call while the first is still running returns that same promise, which makes the usual
 * pair of signal handlers safe to wire without a guard of their own.
 */
export function shutdownServer(
  server: IServerLike,
  options: IShutdownOptions = {},
): CancelablePromise<IShutdownResult, never> {
  const running = getShutdownState(server);
  if (running) {
    return running;
  }

  const grace = resolveGrace(options.timeout);
  const reason = options.reason ?? SERVER_SHUTDOWN;
  // closeServer gates every connection-closing call, not only the listener itself: a caller
  // passing false owns the server's connection lifecycle, so this layer touches none of it and
  // only cancels the tasks and signals it tracks
  const ownsConnections = options.closeServer !== false;
  // registry precedence only, so a setPromiseImpl consumer gets its own class back from the
  // settled outcome this resolves to, same as the rest of the request-cancellation core
  const Impl = resolvePromiseImpl() as unknown as typeof CancelablePromise;
  // getShutdownState above rejected anything that is not an object, so a registry always comes back
  const registry = getRequestRegistry(server, true)!;

  let canceled = 0;
  let completed = 0;
  let timedOut = false;
  let openRequests = 0;
  let listening = ownsConnections && isFunction(server.close);
  let finish: () => void = noop;

  const drained = new Impl<void>((resolve) => {
    finish = resolve;
  });

  const settleIfDrained = () => {
    if (openRequests === 0 && !listening) {
      finish();
    }
  };

  // node 18.2 and up; the declared floor is 18.0, so this is feature detected rather than assumed
  const closeIdle = () => {
    if (ownsConnections && isFunction(server.closeIdleConnections)) {
      server.closeIdleConnections();
    }
  };

  const closeSocket = (socket: ISocketLike | undefined) => {
    if (!ownsConnections || !socket || socket.destroyed === true) {
      return;
    }

    // a pipelined request still owes a response on this connection
    for (const req of registry.open.values()) {
      if (req.socket === socket) {
        return;
      }
    }

    if (isFunction(socket.destroySoon)) {
      socket.destroySoon();
    } else if (isFunction(socket.end)) {
      socket.end();
    }
  };

  const settleDrain = (drain: IDrain) => {
    if (drain.counted || !drain.over || drain.outstanding > 0) {
      return;
    }

    drain.counted = true;
    openRequests -= 1;
    if (drain.wasCanceled) {
      canceled += 1;
    } else {
      completed += 1;
    }

    settleIfDrained();
  };

  const drains = new Map<IResponseLike, IDrain>();

  // outcomes are subscribed BEFORE anything is canceled, so a task that settles during the cancel
  // cascade is still counted
  const watchTasks = (state: IRequestCancelState) => {
    const drain = state.response && drains.get(state.response);
    if (!drain) {
      return;
    }

    state.watch = (task) => {
      drain.outstanding += 1;
      task.then(
        () => {
          drain.outstanding -= 1;
          settleDrain(drain);
        },
        (error) => {
          drain.wasCanceled = drain.wasCanceled || isCancelError(error);
          drain.outstanding -= 1;
          settleDrain(drain);
        },
      );
    };

    for (const task of state.live) {
      state.watch(task);
    }
  };

  const admit = (req: IRequestLike, res: IDrainResponse) => {
    if (drains.has(res)) {
      return;
    }

    const drain: IDrain = { counted: false, outstanding: 0, over: isResponseClosed(res), wasCanceled: false };
    drains.set(res, drain);
    openRequests += 1;

    if (!drain.over) {
      // node detaches the socket from a finished response, so it is read now
      const socket = (res.socket ?? req.socket) as ISocketLike | undefined;

      res.once('close', () => {
        drain.over = true;
        drain.wasCanceled = drain.wasCanceled || hasClientLeft(res);
        closeSocket(socket);
        settleDrain(drain);
      });

      // a response not yet started tells its client not to reuse the connection
      if (ownsConnections && res.headersSent !== true && isFunction(res.setHeader)) {
        res.setHeader('Connection', 'close');
      }
    }

    const state = getRequestState(req);
    if (state) {
      watchTasks(state);
    }

    // a response that closed before admission with nothing in flight never reports again
    settleDrain(drain);
  };

  const cancelRequest = (state: IRequestCancelState) => {
    state.shuttingDown = true;
    state.cancel(reason);
  };

  const inFlight = Array.from(registry.open);
  for (const [res, req] of inFlight) {
    admit(req, res);
  }

  // server.close() only stops new connections, so a request can still arrive on a kept-alive one
  // while this drains
  registry.onArrival = (req, res) => {
    admit(req, res);
    const state = ensureRequestCancelState(req, res);
    if (!state.shuttingDown) {
      cancelRequest(state);
    }
  };
  registry.onTrack = watchTasks;

  if (listening && isFunction(server.close)) {
    // fires once every connection is gone, which covers requests this layer never saw
    server.close(() => {
      listening = false;
      settleIfDrained();
    });
  }
  closeIdle();

  const states = inFlight.map(([, req]) => getRequestState(req)).filter(isDefined);
  for (const state of states) {
    for (const task of state.live) {
      // a strict shielded task throws on cancel, and that would abort the shutdown midway
      try {
        task.cancel(reason);
      } catch (_e) {
        // the task still settles through its own shield, the drain below counts it
      }
    }
  }

  // the signal goes after the tasks it drives, so anything watching it sees a request whose own
  // work has already unwound rather than one mid-teardown
  for (const state of states) {
    cancelRequest(state);
  }

  settleIfDrained();

  const window = new Impl<void>((resolve, _reject, { handleCancel }) => {
    // an infinite grace waits for the drain however long it takes
    let timer =
      grace === Infinity ? undefined : (
        setTimeout(() => {
          // a connection opened before this layer met the server and idle now never closes itself
          closeIdle();
          // one more turn lets a response written in answer to a cancel reach its socket first, and
          // an idle connection closed just now count as gone
          timer = setTimeout(() => {
            timedOut = openRequests > 0 || listening;
            resolve();
          }, 0);
        }, grace)
      );

    // race cancels the loser, so an early finish or cancel clears this timer through here
    handleCancel(() => clearTimeout(timer));
  });

  const stopDraining = () => {
    if (registry.onTrack === watchTasks) {
      registry.onArrival = undefined;
      registry.onTrack = undefined;
    }
  };

  let shutdown: CancelablePromise<IShutdownResult, never>;
  const settle = Impl.race([drained, window]);

  // eslint-disable-next-line prefer-const -- assigned after construction to avoid TDZ in executor closure
  shutdown = new Impl<IShutdownResult, never>((resolve, reject, { handleCancel }) => {
    handleCancel(() => {
      stopDraining();
      settle.cancel(reason);
      clearShutdownState(server, shutdown);
    });

    settle.then(
      () => {
        stopDraining();
        clearShutdownState(server, shutdown);
        // stragglers only: a drain that finished in time has no connection left to close
        if (timedOut && ownsConnections && isFunction(server.closeAllConnections)) {
          server.closeAllConnections();
        }

        resolve({ canceled, completed, timedOut });
      },
      (error) => {
        stopDraining();
        clearShutdownState(server, shutdown);
        reject(error);
      },
    );
  });

  setShutdownState(server, shutdown);

  return shutdown;
}

function resolveGrace(timeout: number | undefined): number {
  if (timeout === undefined || timeout !== timeout) {
    return DEFAULT_SHUTDOWN_TIMEOUT;
  }

  return timeout === Infinity ? timeout : Math.min(Math.max(timeout, 0), MAX_TIMER_MS);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function noop(): void {
  /**/
}
