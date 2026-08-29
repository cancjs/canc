import { CancelablePromise, isCancelError, resolvePromiseImpl } from '@cancjs/promise';

import { isFunction } from '../_util';
import { clearDrainState, getDrainState, getLiveRequests, IRequestCancelState, setDrainState } from './holder';
import { SERVER_SHUTDOWN } from './reasons';
import { IDrainOptions, IDrainResult, IServerLike } from './types';

/** Grace window a drain waits for in-flight requests before it gives up. */
export const DEFAULT_DRAIN_TIMEOUT = 10_000;

/**
 * Stops a server gracefully: no new connections, every in-flight request canceled, and a bounded
 * wait for them to unwind.
 *
 * Each request's own cancel signal is canceled as well, once its tasks have been. That stops the
 * consumers a handler never awaited, such as a detached query or a request-scoped database
 * context, which would otherwise run on through shutdown. Those consumers are not part of the
 * reported counts, which cover the handler tasks this layer holds.
 *
 * Resolves with what happened rather than throwing, so a shutdown path has one thing to log. A
 * second call while the first is still running returns that same promise, which makes the usual
 * pair of signal handlers safe to wire without a guard of their own.
 */
export function drainServer(server: IServerLike, options: IDrainOptions = {}): CancelablePromise<IDrainResult> {
  const running = getDrainState(server);
  if (running) {
    return running;
  }

  const grace = options.timeout ?? DEFAULT_DRAIN_TIMEOUT;
  const reason = options.reason ?? SERVER_SHUTDOWN;
  // registry precedence only, so a setPromiseImpl consumer gets its own class back from the
  // settled outcome this resolves to, same as the rest of the request-cancellation core
  const Impl = resolvePromiseImpl() as unknown as typeof CancelablePromise;

  // closeServer gates every connection-closing call, not only the listener itself: a caller
  // passing false owns the server's connection lifecycle, so this layer touches none of it and
  // only cancels the tasks and signals it tracks
  if (options.closeServer !== false) {
    if (isFunction(server.close)) {
      server.close();
    }

    // node 18.2 and up; the declared floor is 18.0, so both of these are feature detected rather
    // than assumed
    if (isFunction(server.closeIdleConnections)) {
      server.closeIdleConnections();
    }
  }

  // the live registry hangs off this server instance, never off a module-level variable: this
  // directory is inlined into every server package, so a module-scope set would exist once per copy
  // and a drain would only ever see the requests its own copy recorded
  const states: IRequestCancelState[] = [];
  const tasks: CancelablePromise<unknown>[] = [];
  for (const state of getLiveRequests(server) ?? []) {
    states.push(state);
    for (const task of state.live) {
      tasks.push(task);
    }
  }

  let canceled = 0;
  let completed = 0;
  let timedOut = false;

  // outcomes are subscribed BEFORE anything is canceled, so a task that settles during the cancel
  // cascade is still counted
  const outcomes = tasks.map((task) =>
    task.then(
      () => {
        completed += 1;
      },
      (error) => {
        if (isCancelError(error)) {
          canceled += 1;
        } else {
          completed += 1;
        }
      },
    ),
  );

  for (const task of tasks) {
    task.cancel(reason);
  }

  // the signal goes after the tasks it drives, so anything watching it sees a request whose own
  // work has already unwound rather than one mid-teardown
  for (const state of states) {
    state.draining = true;
    state.cancel(reason);
  }

  const window = new Impl<void>((resolve, _reject, { handleCancel }) => {
    const timer = setTimeout(() => {
      timedOut = true;
      resolve();
    }, grace);

    // race cancels the loser, so a drain that finishes early clears this timer through here
    handleCancel(() => clearTimeout(timer));
  });

  const drain = new Impl<IDrainResult>((resolve, reject, { handleCancel }) => {
    handleCancel(() => {
      clearDrainState(server);
    });

    Impl.race([Impl.allSettled(outcomes), window]).then(
      () => {
        clearDrainState(server);
        if (options.closeServer !== false && isFunction(server.closeAllConnections)) {
          server.closeAllConnections();
        }

        resolve({ canceled, completed, timedOut });
      },
      (error) => {
        clearDrainState(server);
        reject(error);
      },
    );
  });

  setDrainState(server, drain);

  return drain;
}
