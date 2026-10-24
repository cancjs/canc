import { CancelablePromise, CancelError, isCancelError, resolvePromiseImpl } from '@cancjs/promise';

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
import { createShutdownError, IShutdownErrorOptions, IStatusCancelError, MAX_TIMER_MS } from './timeout';
import { IRequestLike, IResponseLike, IServerLike, IShutdownOptions, IShutdownResult } from './types';

/** Grace window a shutdown waits for in-flight requests before it gives up. */
export const DEFAULT_SHUTDOWN_TIMEOUT = 10_000;

/** Age at which a connection that sent no bytes is closed at shutdown; capped at the window. */
const REQUESTLESS_AGE_MS = 5_000;

interface IDrainResponse extends IResponseLike {
  headersSent?: boolean;
  writableFinished?: boolean;
  getHeader?: (name: string) => unknown;
  setHeader?: (name: string, value: string) => unknown;
  removeHeader?: (name: string) => void;
  writeHead?: (...args: unknown[]) => unknown;
  socket?: unknown;
}

// a close the app set on its own stays the app's and is never undone
const closesConnection = (res: IDrainResponse) =>
  isFunction(res.getHeader) && /close/i.test(String(res.getHeader('Connection')));

/** One request a shutdown waits on, counted once its response is over and its tasks settled. */
interface IDrain {
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
 * cleanup runs and a response not started yet can still answer. A tracked request still open after
 * that, one canc never canceled included, runs on until it finishes or `closeAfter`; connections
 * still busy at `closeAfter` are force-closed. With `cancelAfter: 0` the handlers are canceled at once
 * instead, a late arrival included.
 *
 * Requests are seen from the first time this layer meets the server: `createShutdown`, the first
 * wrapped handler or request signal on it, the fastify plugin, or the shutdown itself. Connections
 * are seen from `createShutdown` on. One that has received no bytes is closed once it has been open
 * for five seconds, or for the whole cancel window if that is shorter (right away if it is already older),
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
  decorateCancel?: (error: CancelError) => void,
): CancelablePromise<IShutdownResult, never> {
  checkCancelAnswer(options);
  const running = getShutdownState(server);
  if (running) {
    return running;
  }

  const { cancelAfter, closeAfter } = resolveWindows(options);
  const reason = options.reason ?? SERVER_SHUTDOWN;
  const cancelError: IShutdownErrorOptions = { status: options.status, headers: options.headers };
  // closeServer gates every connection-closing call, not only the listener itself: a caller
  // passing false owns the server's connection lifecycle, so this layer touches none of it and
  // only cancels the tasks and signals it tracks
  const ownsConnections = options.closeServer !== false;
  const cancelAtStart = cancelAfter === 0;
  // an idle connection that has sent nothing is held for a late request until closeAfter, even when
  // the cancel is at start; the age is capped at that window
  const windowMs = cancelAtStart ? closeAfter : cancelAfter;
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

  const drained = new Impl<void>((resolve) => {
    finish = resolve;
  });

  const settleIfDrained = () => {
    if (graceEnded && openRequests === 0) {
      destroyUpgraded();
    }
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

  // an upgraded socket leaves node's connection list, so closeAllConnections() skips it and
  // server.close waits on it; node sets its parser to null at the handoff, keep-alive and
  // mid-headers sockets keep one
  const isUpgraded = (socket: IConnectionLike) => (socket as { parser?: unknown }).parser === null;

  const destroyUpgraded = () => {
    if (!ownsConnections || !registry.connections) {
      return;
    }

    for (const socket of Array.from(registry.connections.keys())) {
      if (socket.destroyed !== true && isUpgraded(socket) && isFunction(socket.destroy)) {
        socket.destroy();
      }
    }
  };

  const destroyRemaining = () => {
    if (!ownsConnections || !registry.connections) {
      return;
    }

    for (const socket of Array.from(registry.connections.keys())) {
      if (socket.destroyed !== true && isFunction(socket.destroy)) {
        socket.destroy();
      }
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
    const age = Math.min(REQUESTLESS_AGE_MS, windowMs);
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
  const closingResponses = new Map<IConnectionLike, IDrainResponse>();
  // the responses whose `Connection: close` this shutdown set, so an app-set one is never touched
  const closedHere = new WeakSet<IDrainResponse>();

  // an error answer may rebuild the headers after close was set, so re-assert at head time
  // only while this response is still last on its socket; wrap removes itself
  const reassertCloseAtHead = (socket: IConnectionLike, res: IDrainResponse) => {
    if (res.headersSent === true || !isFunction(res.writeHead)) {
      return;
    }

    const original = res.writeHead;
    const ownWrap = Object.prototype.hasOwnProperty.call(res, 'writeHead');
    res.writeHead = function (this: IDrainResponse, ...args: unknown[]) {
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

    const drain: IDrain = { counted: false, outstanding: 0, over: isResponseClosed(res), req, wasCanceled: false };
    drains.set(res, drain);
    openRequests += 1;

    if (!drain.over) {
      // node detaches the socket from a finished response, so it is read now
      const socket = (res.socket ?? req.socket) as IConnectionLike | undefined;

      const onClose = () => {
        if (drain.over) {
          return;
        }

        drain.over = true;
        socket?.removeListener?.('close', onClose);
        // a response ended but cut before its bytes left the socket was not completed
        drain.wasCanceled =
          drain.wasCanceled || hasClientLeft(res) || res.writableFinished === false || isCanceledHere(req);
        closeSocket(socket);
        settleDrain(drain);
        if (graceEnded && !hardEnded && !holdsWindow()) {
          hardEnd(false);
        }
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
    settleDrain(drain);
  };

  const isCanceledHere = (req: IRequestLike) => getRequestState(req)?.shuttingDown === true;

  // what is still open at the hard end is force-closed, counted here since its close can come later
  const countForced = () => {
    for (const drain of drains.values()) {
      if (drain.counted) {
        continue;
      }

      drain.counted = true;
      openRequests -= 1;
      if (drain.over && !drain.wasCanceled && !isCanceledHere(drain.req)) {
        completed += 1;
      } else {
        canceled += 1;
      }
    }
  };

  // one instance per request: its live tasks and its signal get the same cancellation, and no two
  // requests share one
  const cancelRequest = (state: IRequestCancelState, error = createShutdownError(reason, cancelError)) => {
    if (!state.shuttingDown) {
      state.shuttingDown = true;
      state.decorateCancel?.(error);
      state.cancel(error);
    }
  };

  const cancelOpenRequests = () => {
    const states: Array<[IRequestCancelState, IStatusCancelError]> = [];
    for (const drain of drains.values()) {
      const state = drain.counted ? undefined : getRequestState(drain.req);
      if (state) {
        states.push([state, createShutdownError(reason, cancelError)]);
      }
    }

    for (const [state, error] of states) {
      for (const task of Array.from(state.live)) {
        // a strict shielded task throws on cancel, and that would abort the shutdown midway
        try {
          task.cancel(error);
        } catch (_e) {
          // the task still settles through its own shield, the drain counts it
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
  // while this drains, and it is served like any other unless the start cancels handlers
  registry.onArrival = (req, res) => {
    admit(req, res);
    if (cancelAtStart) {
      cancelRequest(ensureRequestCancelState(req, res, undefined, decorateCancel));
    }
  };
  registry.onTrack = (state) => {
    watchTasks(state);
    if (cancelAtStart || graceEnded) {
      cancelRequest(state);
    }
  };

  if (listening && isFunction(server.close)) {
    // fires once every connection is gone, which covers requests this layer never saw
    server.close(() => {
      listening = false;
      settleIfDrained();
    });
  }
  closeIdle();
  closeRequestless();

  // anything still open at the cancel point holds the window until closeAfter,
  // an untouched request included; the window ends as soon as nothing is open
  let endWindow: () => void = noop;
  let cancelTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let hardEnded = false;

  // race cancels the loser, so an early finish or cancel clears the timers through here
  const window = new Impl<void>((resolve, _reject, { handleCancel }) => {
    endWindow = resolve;
    handleCancel(() => {
      clearTimeout(cancelTimer);
      clearTimeout(closeTimer);
    });
  });

  const hardEnd = (expired: boolean) => {
    if (hardEnded) {
      return;
    }

    hardEnded = true;
    clearTimeout(cancelTimer);
    clearTimeout(closeTimer);
    timedOut = expired && (openRequests > 0 || listening);
    // a connection opened before this layer met the server and idle now never closes itself
    closeIdle();
    endWindow();
  };

  // a request or a connection still open holds the window: nothing is force-closed before
  // closeAfter. server.close fires once every connection has ended, so this also covers a
  // connection canc never saw
  const holdsWindow = () => openRequests > 0 || listening;

  // only one timer is armed at a time: the cancel point until it fires, then the hard end
  const atCancelPoint = () => {
    graceEnded = true;
    cancelOpenRequests();
    closeIdle();
    if (openRequests === 0) {
      destroyUpgraded();
    }
    if (!holdsWindow()) {
      hardEnd(false);
    } else if (closeAfter !== Infinity) {
      closeTimer = setTimeout(() => hardEnd(true), closeAfter - cancelAfter);
    }
  };

  // an infinite window waits for the drain however long it takes
  if (cancelAtStart) {
    atCancelPoint();
  } else if (cancelAfter !== Infinity) {
    cancelTimer = setTimeout(atCancelPoint, cancelAfter);
  }

  settleIfDrained();

  const onArrival = registry.onArrival;
  const stopDraining = () => {
    if (registry.onArrival === onArrival) {
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
        if ((openRequests > 0 || listening) && ownsConnections && isFunction(server.closeAllConnections)) {
          server.closeAllConnections();
          // closeAllConnections() skips upgraded sockets, so the hard end closes them here
          destroyRemaining();
        }
        countForced();

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

/**
 * Sets up the graceful shutdown of a server and returns the function that runs it. Connections
 * and requests are recorded from this call on, which is what lets the shutdown close a connection
 * that has received no bytes once it is old enough, and mark every in-flight response
 * `Connection: close`. A second call
 * for the same server returns the same function.
 */
export function createServerShutdown(
  server: IServerLike,
  decorateCancel?: (error: CancelError) => void,
): TShutdownFunction {
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

  const shutdown: TShutdownFunction = (options) => shutdownServer(server, options, decorateCancel);
  setShutdownFunction(server, shutdown);

  return shutdown;
}

// a status or header the platform would refuse throws here, not inside a request mid-drain
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const INVALID_HEADER_VALUE = /[^\t\x20-\x7e\x80-\xff]/;

function checkCancelAnswer(options: IShutdownOptions): void {
  const { status, headers } = options;
  if (status !== undefined && (!Number.isInteger(status) || status < 200 || status > 599)) {
    throw new RangeError(`status (${status}) must be an integer from 200 to 599`);
  }

  if (headers !== undefined && (typeof headers !== 'object' || headers === null || Array.isArray(headers))) {
    throw new TypeError('headers must be an object of header names to values');
  }

  for (const [name, value] of Object.entries(headers ?? {})) {
    if (!HEADER_NAME.test(name)) {
      throw new TypeError(`header name (${name}) is not a valid token`);
    }
    if (typeof value !== 'string' || INVALID_HEADER_VALUE.test(value)) {
      throw new TypeError(`header ${name} has an invalid value`);
    }
  }
}

function resolveWindows(options: IShutdownOptions): { cancelAfter: number; closeAfter: number } {
  const cancelAt = usableMs(options.cancelAfter);
  const closeAt = usableMs(options.closeAfter);
  // order is checked on clamped values, so a negative pair clamping to 0 and 0 is not reversed
  if (cancelAt !== undefined && closeAt !== undefined && clampMs(cancelAt) > clampMs(closeAt)) {
    throw new RangeError(`cancelAfter (${cancelAt}) is greater than closeAfter (${closeAt})`);
  }
  if (cancelAt !== undefined) {
    const cancel = clampMs(cancelAt);
    return { cancelAfter: cancel, closeAfter: closeAt === undefined ? clampMs(cancel + 1000) : clampMs(closeAt) };
  }
  if (closeAt !== undefined) {
    const close = clampMs(closeAt);
    return { cancelAfter: Math.max(0, close - 1000), closeAfter: close };
  }
  return { cancelAfter: DEFAULT_SHUTDOWN_TIMEOUT, closeAfter: DEFAULT_SHUTDOWN_TIMEOUT + 1000 };
}

function usableMs(ms: number | undefined): number | undefined {
  return ms === undefined || ms !== ms ? undefined : ms;
}

function clampMs(ms: number): number {
  return ms === Infinity ? ms : Math.min(Math.max(ms, 0), MAX_TIMER_MS);
}

function noop(): void {
  /**/
}
