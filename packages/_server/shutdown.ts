import { CancelablePromise, isCancelError, resolvePromiseImpl } from '@cancjs/promise';

import { isFunction } from '../_util';
import { hasClientLeft } from './exchange';
import {
  clearShutdownState,
  getRequestRegistry,
  getRequestState,
  getShutdownFunction,
  getShutdownState,
  IConnectionLike,
  IRequestCancelState,
  setShutdownFunction,
  setShutdownState,
  trackConnections,
  TShutdownFunction,
} from './holder';
import { ensureRequestCancelState, isResponseClosed } from './node-signal';
import { SERVER_SHUTDOWN } from './reasons';
import { createShutdownError, IStatusCancelError, MAX_TIMER_MS } from './timeout';
import { IRequestLike, IResponseLike, IServerLike, IShutdownOptions, IShutdownResult } from './types';

/** Grace window a shutdown waits for in-flight requests before it gives up. */
export const DEFAULT_SHUTDOWN_TIMEOUT = 10_000;

/** Age at which a connection that sent no bytes is closed at shutdown; capped at the grace window. */
const REQUESTLESS_AGE_MS = 5_000;

interface IShutdownResponse extends IResponseLike {
  headersSent?: boolean;
  writableFinished?: boolean;
  getHeader?: (name: string) => unknown;
  setHeader?: (name: string, value: string) => unknown;
  removeHeader?: (name: string) => void;
  writeHead?: (...args: unknown[]) => unknown;
  socket?: unknown;
}

// a close the app set on its own stays the app's and is never undone
const closesConnection = (res: IShutdownResponse) =>
  isFunction(res.getHeader) && /close/i.test(String(res.getHeader('Connection')));

/** One request a shutdown waits on, counted once its response is over and its tasks settled. */
interface IRequestTally {
  req: IRequestLike;
  outstanding: number;
  wasCanceled: boolean;
  over: boolean;
  counted: boolean;
}

/**
 * Stops a server gracefully: no new connections, a grace window for in-flight requests to finish,
 * and a cancel for whatever is still running when it ends.
 *
 * Every request runs on until the window ends, wrapped or not, including one that arrives on a
 * kept-alive connection while the shutdown runs. Every response sent from here on carries
 * `Connection: close`, and each connection is closed as soon as the response on it finishes. When
 * the window ends, the handlers still running are canceled with the shutdown reason, so their
 * cleanup runs and a response not started yet can still answer. Connections still busy after that
 * are force-closed. With `cancelOnStart` the handlers are canceled at once instead, a late arrival
 * included, and the window is only the wait for them to unwind.
 *
 * Requests are seen from the first time this layer meets the server: `createShutdown`, the first
 * wrapped handler or request signal on it, the fastify plugin, or the shutdown itself. Connections
 * are seen from `createShutdown` on. One that has received no bytes is closed once it has been open
 * for five seconds, or for the whole grace if that is shorter (right away if it is already older),
 * while one that has already sent part of a request is left to finish. A connection opened
 * before that is unknown: if it has not sent a request, or its response is still in flight, it is
 * closed only when the window runs out.
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
  const cancelOnStart = options.cancelOnStart === true;
  // registry precedence only, so a setPromiseImpl consumer gets its own class back from the
  // settled outcome this resolves to, same as the rest of the request-cancellation core
  const Impl = resolvePromiseImpl() as unknown as typeof CancelablePromise;
  // getShutdownState above rejected anything that is not an object, so a registry always comes back
  const registry = getRequestRegistry(server, true)!;

  let canceled = 0;
  let completed = 0;
  let timedOut = false;
  let graceEnded = false;
  let openRequests = 0;
  let listening = ownsConnections && isFunction(server.close);
  let finish: () => void = noop;

  const emptied = new Impl<void>((resolve) => {
    finish = resolve;
  });

  const settleIfEmptied = () => {
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

  // a pipelined request still owes a response on its connection
  const carriesRequest = (socket: IConnectionLike) => {
    for (const req of registry.open.values()) {
      if (req.socket === socket) {
        return true;
      }
    }

    return false;
  };

  const closeSocket = (socket: IConnectionLike | undefined) => {
    if (!ownsConnections || !socket || socket.destroyed === true) {
      return;
    }

    if (carriesRequest(socket)) {
      return;
    }

    if (isFunction(socket.destroySoon)) {
      socket.destroySoon();
    } else if (isFunction(socket.end)) {
      socket.end();
    }
  };

  const destroyRequestless = (socket: IConnectionLike) => {
    if (socket.destroyed !== true && socket.bytesRead === 0 && !carriesRequest(socket) && isFunction(socket.destroy)) {
      socket.destroy();
    }
  };

  // closeIdleConnections() skips a connection that never sent a request
  // an empty one closes only once old enough that its first request is not cut off
  // a younger one is checked again at that age
  // one with request bytes read is left to answer
  const closeRequestless = () => {
    if (!ownsConnections || !registry.connections) {
      return;
    }

    const now = Date.now();
    const age = Math.min(REQUESTLESS_AGE_MS, grace);
    for (const [socket, acceptedAt] of Array.from(registry.connections)) {
      if (socket.bytesRead !== 0 || carriesRequest(socket)) {
        continue;
      }

      const remaining = acceptedAt + age - now;
      if (remaining <= 0) {
        destroyRequestless(socket);
        continue;
      }

      const timer = setTimeout(() => destroyRequestless(socket), remaining);
      socket.once?.('close', () => clearTimeout(timer));
    }
  };

  const settleTally = (tally: IRequestTally) => {
    if (tally.counted || !tally.over || tally.outstanding > 0) {
      return;
    }

    tally.counted = true;
    openRequests -= 1;
    if (tally.wasCanceled) {
      canceled += 1;
    } else {
      completed += 1;
    }

    settleIfEmptied();
  };

  const tallies = new Map<IResponseLike, IRequestTally>();
  const closingResponses = new Map<IConnectionLike, IShutdownResponse>();
  // the responses whose `Connection: close` this shutdown set, so an app-set one is never touched
  const closedHere = new WeakSet<IShutdownResponse>();

  // koa strips headers before an error answer, so re-assert close at head time
  // only while this response is still last on its socket; wrap removes itself
  const reassertCloseAtHead = (socket: IConnectionLike, res: IShutdownResponse) => {
    if (res.headersSent === true || !isFunction(res.writeHead)) {
      return;
    }

    const original = res.writeHead;
    const ownWrap = Object.prototype.hasOwnProperty.call(res, 'writeHead');
    res.writeHead = function (this: IShutdownResponse, ...args: unknown[]) {
      if (ownWrap) {
        res.writeHead = original;
      } else {
        delete res.writeHead;
      }

      if (
        closingResponses.get(socket) === res &&
        res.headersSent !== true &&
        isFunction(res.setHeader) &&
        !closesConnection(res)
      ) {
        res.setHeader('Connection', 'close');
        closedHere.add(res);
      }

      return original.apply(res, args);
    };
  };

  // outcomes are subscribed BEFORE anything is canceled, so a task that settles during the cancel
  // cascade is still counted
  const watchTasks = (state: IRequestCancelState) => {
    const tally = state.response && tallies.get(state.response);
    if (!tally) {
      return;
    }

    state.watch = (task) => {
      tally.outstanding += 1;
      task.then(
        () => {
          tally.outstanding -= 1;
          settleTally(tally);
        },
        (error) => {
          tally.wasCanceled = tally.wasCanceled || isCancelError(error);
          tally.outstanding -= 1;
          settleTally(tally);
        },
      );
    };

    for (const task of state.live) {
      state.watch(task);
    }
  };

  const admit = (req: IRequestLike, res: IShutdownResponse) => {
    if (tallies.has(res)) {
      return;
    }

    const tally: IRequestTally = {
      counted: false,
      outstanding: 0,
      over: isResponseClosed(res),
      req,
      wasCanceled: false,
    };
    tallies.set(res, tally);
    openRequests += 1;

    if (!tally.over) {
      // node detaches the socket from a finished response, so it is read now
      const socket = (res.socket ?? req.socket) as IConnectionLike | undefined;

      const onClose = () => {
        if (tally.over) {
          return;
        }

        tally.over = true;
        socket?.removeListener?.('close', onClose);
        // a response ended but cut before its bytes left the socket was not completed
        tally.wasCanceled = tally.wasCanceled || hasClientLeft(res) || res.writableFinished === false;
        closeSocket(socket);
        settleTally(tally);
      };

      res.once('close', onClose);
      // node 18 never closes a response still queued behind one that closed the connection
      socket?.once?.('close', onClose);

      // only the last response queued on a connection carries Connection: close
      // removing an earlier one's header makes node end the connection after it too
      // so an earlier one set here goes back to keep-alive, even when this one has started
      if (ownsConnections && socket) {
        const previous = closingResponses.get(socket);
        if (
          previous &&
          previous !== res &&
          previous.headersSent !== true &&
          closedHere.has(previous) &&
          isFunction(previous.setHeader)
        ) {
          previous.setHeader('Connection', 'keep-alive');
          closedHere.delete(previous);
        }

        if (res.headersSent !== true && isFunction(res.setHeader) && !closesConnection(res)) {
          res.setHeader('Connection', 'close');
          closedHere.add(res);
        }

        closingResponses.set(socket, res);
        reassertCloseAtHead(socket, res);
      }
    }

    const state = getRequestState(req);
    if (state) {
      watchTasks(state);
    }

    // a response that closed before admission with nothing in flight never reports again
    settleTally(tally);
  };

  // one instance per request: its live tasks and its signal get the same cancellation, and no two
  // requests share one
  const cancelRequest = (state: IRequestCancelState, error = createShutdownError(reason)) => {
    if (!state.shuttingDown) {
      state.shuttingDown = true;
      state.cancel(error);
    }
  };

  const cancelOpenRequests = () => {
    const states: Array<[IRequestCancelState, IStatusCancelError]> = [];
    for (const tally of tallies.values()) {
      const state = tally.counted ? undefined : getRequestState(tally.req);
      if (state) {
        states.push([state, createShutdownError(reason)]);
      }
    }

    for (const [state, error] of states) {
      for (const task of Array.from(state.live)) {
        // a strict shielded task throws on cancel, and that would abort the shutdown midway
        try {
          task.cancel(error);
        } catch (_e) {
          // the task still settles through its own shield, the shutdown counts it
        }
      }
    }

    // the signal goes after the tasks it drives, so anything watching it sees a request whose own
    // work has already unwound rather than one mid-teardown
    for (const [state, error] of states) {
      cancelRequest(state, error);
    }
  };

  for (const [res, req] of Array.from(registry.open)) {
    admit(req, res);
  }

  // server.close() only stops new connections, so a request can still arrive on a kept-alive one
  // while shutdown runs, and it is served like any other unless the start cancels handlers
  registry.onArrival = (req, res) => {
    admit(req, res);
    if (cancelOnStart) {
      cancelRequest(ensureRequestCancelState(req, res));
    }
  };
  registry.onTrack = (state) => {
    watchTasks(state);
    if (cancelOnStart || graceEnded) {
      cancelRequest(state);
    }
  };

  if (listening && isFunction(server.close)) {
    // fires once every connection is gone, which covers requests this layer never saw
    server.close(() => {
      listening = false;
      settleIfEmptied();
    });
  }
  closeIdle();
  closeRequestless();

  if (cancelOnStart) {
    cancelOpenRequests();
  }

  settleIfEmptied();

  const window = new Impl<void>((resolve, _reject, { handleCancel }) => {
    // an infinite grace waits for shutdown however long it takes
    let timer =
      grace === Infinity ? undefined : (
        setTimeout(() => {
          graceEnded = true;
          timedOut = openRequests > 0;
          cancelOpenRequests();
          // a connection opened before this layer met the server and idle now never closes itself
          closeIdle();
          // one more turn lets a response written in answer to a cancel reach its socket first, and
          // an idle connection closed just now count as gone
          timer = setTimeout(() => {
            timedOut = timedOut || openRequests > 0 || listening;
            resolve();
          }, 0);
        }, grace)
      );

    // race cancels the loser, so an early finish or cancel clears this timer through here
    handleCancel(() => clearTimeout(timer));
  });

  const onArrival = registry.onArrival;
  const stopWaiting = () => {
    if (registry.onArrival === onArrival) {
      registry.onArrival = undefined;
      registry.onTrack = undefined;
    }
  };

  let shutdown: CancelablePromise<IShutdownResult, never>;
  const settle = Impl.race([emptied, window]);

  // eslint-disable-next-line prefer-const -- assigned after construction to avoid TDZ in executor closure
  shutdown = new Impl<IShutdownResult, never>((resolve, reject, { handleCancel }) => {
    handleCancel(() => {
      stopWaiting();
      settle.cancel(reason);
      clearShutdownState(server, shutdown);
    });

    settle.then(
      () => {
        stopWaiting();
        clearShutdownState(server, shutdown);
        // stragglers only: a shutdown that finished in time has no connection left to close
        if ((openRequests > 0 || listening) && ownsConnections && isFunction(server.closeAllConnections)) {
          server.closeAllConnections();
        }

        resolve({ canceled, completed, timedOut });
      },
      (error) => {
        stopWaiting();
        clearShutdownState(server, shutdown);
        reject(error);
      },
    );
  });

  setShutdownState(server, shutdown);

  return shutdown;
}

/**
 * Sets up the graceful shutdown of a server and returns the function that runs it. Connections
 * and requests are recorded from this call on, which is what lets the shutdown close a connection
 * that has received no bytes once it is old enough, and mark every in-flight response
 * `Connection: close`. A second call
 * for the same server returns the same function.
 */
export function createServerShutdown(server: IServerLike): TShutdownFunction {
  if (server === null || (typeof server !== 'object' && typeof server !== 'function')) {
    throw new TypeError(
      `createShutdown() needs the http server as its first argument, got ${server === null ? 'null' : typeof server}.`,
    );
  }

  const cached = getShutdownFunction(server);
  if (cached) {
    return cached;
  }

  trackConnections(server);

  const shutdown: TShutdownFunction = (options) => shutdownServer(server, options);
  setShutdownFunction(server, shutdown);

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
