import { CancelablePromise, isCancelError, resolvePromiseImpl } from '@cancjs/promise';

import { isFunction } from '../_util';
import { hasClientLeft, toRequestLike, toResponseLike } from './exchange';
import { clearShutdownState, getLiveRequests, getShutdownState, IRequestCancelState, setShutdownState } from './holder';
import { ensureRequestCancelState, isResponseClosed } from './node-signal';
import { SERVER_SHUTDOWN } from './reasons';
import { MAX_TIMER_MS } from './timeout';
import { IResponseLike, IServerLike, IShutdownOptions, IShutdownResult } from './types';

/** Grace window a shutdown waits for in-flight requests before it gives up. */
export const DEFAULT_SHUTDOWN_TIMEOUT = 10_000;

// how often a drain closes keep-alive sockets that went idle after a response this layer never saw
const IDLE_SWEEP_INTERVAL = 100;

interface IDrainResponse extends IResponseLike {
  headersSent?: boolean;
  setHeader?: (name: string, value: string) => unknown;
}

type TRequestListener = (req: unknown, res: unknown) => void;

interface IListenerHost {
  prependListener?: (event: 'request', listener: TRequestListener) => unknown;
  removeListener?: (event: 'request', listener: TRequestListener) => unknown;
}

/**
 * Stops a server gracefully: no new connections, every in-flight request canceled, and a bounded
 * wait for their responses to finish.
 *
 * The wait is on responses, not on handler tasks, so a route this layer never wrapped still gets to
 * answer inside the grace window. Connections are force-closed only when the window runs out. A
 * request arriving on a kept-alive connection while the shutdown runs is canceled on arrival and
 * answered with `Connection: close`.
 *
 * Each request's own cancel signal is canceled as well, once its tasks have been. That stops the
 * consumers a handler never awaited, such as a detached query or a request-scoped database
 * context, which would otherwise run on through shutdown. Counts are per tracked request: one whose
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

  const admit = (state: IRequestCancelState) => {
    const response = state.response as IDrainResponse | undefined;
    let outstanding = 0;
    let wasCanceled = false;
    let responseOver = !response || isResponseClosed(response);
    let counted = false;

    const settleRequest = () => {
      if (counted || !responseOver || outstanding > 0) {
        return;
      }

      counted = true;
      openRequests -= 1;
      if (wasCanceled) {
        canceled += 1;
      } else {
        completed += 1;
      }

      // a finished response leaves its kept-alive socket idle, and only an idle socket lets the
      // server close callback fire
      closeIdle();
      settleIfDrained();
    };

    // outcomes are subscribed BEFORE anything is canceled, so a task that settles during the cancel
    // cascade is still counted
    state.watch = (task) => {
      outstanding += 1;
      task.then(
        () => {
          outstanding -= 1;
          settleRequest();
        },
        (error) => {
          wasCanceled = wasCanceled || isCancelError(error);
          outstanding -= 1;
          settleRequest();
        },
      );
    };

    openRequests += 1;
    for (const task of state.live) {
      state.watch(task);
    }

    if (response && !responseOver) {
      response.once('close', () => {
        responseOver = true;
        wasCanceled = wasCanceled || hasClientLeft(response);
        settleRequest();
      });

      // a response not yet started tells its client not to reuse the connection
      if (ownsConnections && response.headersSent !== true && isFunction(response.setHeader)) {
        response.setHeader('Connection', 'close');
      }
    }
  };

  const cancelRequest = (state: IRequestCancelState) => {
    state.shuttingDown = true;
    state.cancel(reason);
  };

  // the live registry hangs off this server instance, never off a module-level variable: this
  // directory is inlined into every server package, so a module-scope set would exist once per copy
  // and a shutdown would only ever see the requests its own copy recorded
  const states = Array.from(getLiveRequests(server) ?? []);
  for (const state of states) {
    admit(state);
  }

  // server.close() only stops new connections, so a request can still arrive on a kept-alive one
  // while this drains; prepended so it is canceled before the application's own listener runs
  const host = server as IListenerHost;
  const onRequest: TRequestListener = (req, res) => {
    const state = ensureRequestCancelState(toRequestLike(req), toResponseLike(res));
    if (!state.shuttingDown) {
      admit(state);
      cancelRequest(state);
    }
  };
  if (isFunction(host.prependListener)) {
    host.prependListener('request', onRequest);
  }

  if (listening && isFunction(server.close)) {
    // fires once every connection is gone, which covers requests this layer never tracked
    server.close(() => {
      listening = false;
      settleIfDrained();
    });
  }
  closeIdle();
  const sweep = ownsConnections ? setInterval(closeIdle, IDLE_SWEEP_INTERVAL) : undefined;

  for (const state of states) {
    for (const task of state.live) {
      task.cancel(reason);
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
    const timer =
      grace === Infinity ? undefined : (
        setTimeout(() => {
          timedOut = true;
          resolve();
        }, grace)
      );

    // race cancels the loser, so an early finish or cancel clears this timer through here
    handleCancel(() => clearTimeout(timer));
  });

  const stopDraining = () => {
    clearInterval(sweep);
    if (isFunction(host.removeListener)) {
      host.removeListener('request', onRequest);
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

function noop(): void {
  /**/
}
