import { CancelablePromise, CancelError, isCancelError, TimeoutError } from '@cancjs/promise';
import { getEventListeners } from 'events';

import { createExchange, flush, outcomeOf, pending } from './__tests__/fakes';
import { cancelHeadersOf, cancelStatusOf, ownedStatusOf, stampDerivedCancel } from './exchange';
import { getRequestState } from './holder';
import { ensureRequestCancelState } from './node-signal';
import { CLIENT_DISCONNECTED, HANDLER_TIMEOUT } from './reasons';
import { mergeHandlerOptions, runCancelableHandler } from './run';
import { createShutdownError, IStatusCancelError } from './timeout';

describe('option merge', () => {
  it('is the base when there is nothing to override with', () => {
    expect(mergeHandlerOptions({ bubble: false })).toEqual({ bubble: false });
  });

  it('is the override when there is no base', () => {
    expect(mergeHandlerOptions(undefined, { timeout: 5 })).toEqual({ timeout: 5 });
  });

  it('lets the route win key by key', () => {
    expect(mergeHandlerOptions({ bubble: false, timeout: 50 }, { timeout: 10 })).toEqual({
      bubble: false,
      timeout: 10,
    });
  });

  it('is an empty bag when neither side supplied one', () => {
    expect(mergeHandlerOptions()).toEqual({});
  });
});

describe('generator handler', () => {
  it('stops at its suspension point when the client disconnects', async () => {
    const { req, res } = createExchange();
    const steps: string[] = [];

    const task = runCancelableHandler(
      function* () {
        steps.push('started');
        yield pending();
        steps.push('resumed');
      },
      req,
      res,
    );

    const outcome = outcomeOf(task);
    await flush();
    res.disconnect();

    expect(isCancelError(await outcome)).toBe(true);
    expect(steps).toEqual(['started']);
  });

  it('runs to completion when nobody cancels', async () => {
    const { req, res } = createExchange();

    const task = runCancelableHandler(
      function* (): Generator<unknown, number> {
        const value = (yield CancelablePromise.resolve(2)) as number;

        return value * 21;
      },
      req,
      res,
    );

    expect(await task).toBe(42);
  });

  it('never steps for a client that already went away', async () => {
    const { req, res } = createExchange();
    res.destroyed = true;
    let stepped = false;

    const task = runCancelableHandler(
      function* () {
        stepped = true;
        yield pending();
      },
      req,
      res,
    );

    expect(isCancelError(await outcomeOf(task))).toBe(true);
    expect(stepped).toBe(false);
  });

  it('is tracked as live while it runs', () => {
    const { req, res } = createExchange();
    const task = runCancelableHandler(
      function* () {
        yield pending();
      },
      req,
      res,
    );

    expect(getRequestState(req)?.live).toEqual(new Set([task]));
  });
});

describe('plain handler', () => {
  it('cancels the wrapper while the async body keeps running', async () => {
    const { req, res } = createExchange();
    let finished = false;

    const task = runCancelableHandler(
      async () => {
        await flush();
        finished = true;

        return 'late';
      },
      req,
      res,
    );

    const outcome = outcomeOf(task);
    res.disconnect();

    expect(isCancelError(await outcome)).toBe(true);

    await flush();
    await flush();

    expect(finished).toBe(true);
  });

  it('cancels a cancelable promise it returned', async () => {
    const { req, res } = createExchange();
    const inner = pending();

    const outcome = outcomeOf(runCancelableHandler(() => inner, req, res));
    res.disconnect();

    expect(isCancelError(await outcome)).toBe(true);
    // the wrapper releases its consumer ref, a sole-consumer source is canceled a few jobs later
    await flush();
    expect(inner.canceled).toBe(true);
  });

  it('adopts a plain value', async () => {
    const { req, res } = createExchange();

    expect(await runCancelableHandler(() => 'sync', req, res)).toBe('sync');
  });
});

describe('synchronous handler throw', () => {
  it('rejects the task when the handler throws before it suspends', async () => {
    jest.useFakeTimers();

    try {
      const { req, res } = createExchange();
      const state = ensureRequestCancelState(req, res);
      const failure = new Error('boom');
      const onTimeout = jest.fn();
      let task: CancelablePromise<unknown> | undefined;

      expect(() => {
        task = runCancelableHandler(
          () => {
            throw failure;
          },
          req,
          res,
          { onTimeout, timeout: 30 },
        );
      }).not.toThrow();

      expect(await outcomeOf(task!)).toBe(failure);

      // the error handler answers and closes the response, which takes the deadline down through
      // the same teardown every other settled handler goes through
      res.end();
      jest.advanceTimersByTime(30);

      expect(state.timer).toBeUndefined();
      expect(onTimeout).not.toHaveBeenCalled();
      expect(state.signal.aborted).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels a task whose handler aborts the request while the task is still starting', async () => {
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res);
    let outcome: unknown;

    // the abort lands inside the handler call, before the task joins the in-flight set, so the
    // forwarder has nothing to cancel yet and the task must be canceled once it is registered
    const task = runCancelableHandler(
      () => {
        state.cancel(CLIENT_DISCONNECTED);

        return pending();
      },
      req,
      res,
    );

    task.catch((error: unknown) => {
      outcome = error;
    });
    await flush();

    expect(isCancelError(outcome)).toBe(true);
    expect((outcome as CancelError).message).toBe(CLIENT_DISCONNECTED);
    expect(state.live.size).toBe(0);
  });

  it('stops tracking a task whose handler threw once the response closes', async () => {
    const { req, res } = createExchange();
    const failure = new Error('boom');

    const task = runCancelableHandler(
      () => {
        throw failure;
      },
      req,
      res,
    );
    const outcome = outcomeOf(task);

    expect(getRequestState(req)?.live).toEqual(new Set([task]));

    res.end();

    expect(await outcome).toBe(failure);
    expect(getRequestState(req)?.live.size).toBe(0);
  });
});

describe('async generator handler', () => {
  it('rejects the task with a TypeError instead of resolving the generator', async () => {
    const { req, res } = createExchange();

    const task = runCancelableHandler(
      async function* () {
        yield 1;
      },
      req,
      res,
    );

    const error = await outcomeOf(task);

    expect(error).toBeInstanceOf(TypeError);
    expect((error as TypeError).message).toContain('async generator');
  });

  it('never runs the body of the rejected generator', async () => {
    const { req, res } = createExchange();
    let ran = false;

    const task = runCancelableHandler(
      async function* () {
        ran = true;
        yield 1;
      },
      req,
      res,
    );

    expect(await outcomeOf(task)).toBeInstanceOf(TypeError);
    expect(ran).toBe(false);
  });

  it('recognizes a transpiled async generator by its result shape', async () => {
    const { req, res } = createExchange();
    const lookalike = {
      next: () => ({ done: true, value: undefined }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };

    expect(await outcomeOf(runCancelableHandler(() => lookalike, req, res))).toBeInstanceOf(TypeError);
  });

  it('leaves a plain object with a next method alone', async () => {
    const { req, res } = createExchange();
    const value = { next: () => 1 };

    expect(await runCancelableHandler(() => value, req, res)).toBe(value);
  });
});

describe('handler deadline', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cancels with the default status on the shorthand form', async () => {
    const { req, res } = createExchange();

    const outcome = outcomeOf(
      runCancelableHandler(
        function* () {
          yield pending();
        },
        req,
        res,
        { timeout: 30 },
      ),
    );

    jest.advanceTimersByTime(30);

    const error = (await outcome) as IStatusCancelError;

    expect(isCancelError(error)).toBe(true);
    expect(error.timedOut).toBe(true);
    expect(error.message).toBe(HANDLER_TIMEOUT);
    expect(error.status).toBe(503);
    expect(error.statusCode).toBe(503);
  });

  it('takes the status from the object form', async () => {
    const { req, res } = createExchange();

    const outcome = outcomeOf(
      runCancelableHandler(
        function* () {
          yield pending();
        },
        req,
        res,
        { timeout: { message: 'slow query', ms: 30, status: 504 } },
      ),
    );

    jest.advanceTimersByTime(30);

    const error = (await outcome) as IStatusCancelError;

    expect(error.status).toBe(504);
    expect(error.statusCode).toBe(504);
    expect(error.message).toBe('slow query');
  });

  it('aborts the shared request signal, not just the handler', () => {
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res);

    void outcomeOf(
      runCancelableHandler(
        function* () {
          yield pending();
        },
        req,
        res,
        { timeout: 30 },
      ),
    );

    jest.advanceTimersByTime(30);

    expect(state.signal.aborted).toBe(true);
    expect((state.signal.reason as CancelError).timedOut).toBe(true);
  });

  it('lets a route shorten the deadline the plugin set', async () => {
    const { req, res } = createExchange();
    ensureRequestCancelState(req, res, { timeout: 50_000 });

    const outcome = outcomeOf(
      runCancelableHandler(
        function* () {
          yield pending();
        },
        req,
        res,
        { timeout: 30 },
      ),
    );

    jest.advanceTimersByTime(30);

    expect(((await outcome) as CancelError).timedOut).toBe(true);
  });

  it('stops the timer once the response is over', () => {
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res);

    void outcomeOf(runCancelableHandler(() => 'fast', req, res, { timeout: 30 }));
    res.end();

    jest.advanceTimersByTime(30);

    expect(state.signal.aborted).toBe(false);
    expect(state.timer).toBeUndefined();
  });
});

describe('request deadline', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts when the middleware options are installed, with no handler wrapped', () => {
    const { req, res } = createExchange();
    const onTimeout = jest.fn();
    const state = ensureRequestCancelState(req, res, { onTimeout, timeout: 30 });

    jest.advanceTimersByTime(30);

    expect((state.signal.reason as CancelError).timedOut).toBe(true);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('lets a route lengthen the deadline the middleware set', () => {
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res, { timeout: 30 });

    void outcomeOf(runCancelableHandler(() => pending(), req, res, { timeout: 100 }));

    jest.advanceTimersByTime(30);
    expect(state.signal.aborted).toBe(false);

    jest.advanceTimersByTime(70);
    expect(state.signal.aborted).toBe(true);
  });

  it('is lifted by a route timeout with no usable limit', () => {
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res, { timeout: 30 });

    void outcomeOf(runCancelableHandler(() => pending(), req, res, { timeout: Infinity }));

    jest.advanceTimersByTime(1000);

    expect(state.signal.aborted).toBe(false);
    expect(state.timer).toBeUndefined();
  });

  it('ends once the handler answering the request settles', async () => {
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res);

    expect(await runCancelableHandler(() => 'answered', req, res, { timeout: 30 })).toBe('answered');

    jest.advanceTimersByTime(30);

    expect(state.signal.aborted).toBe(false);
    expect(state.timer).toBeUndefined();
  });

  it('keeps running for the layer a settled middleware handed the request to', async () => {
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res, { timeout: 30 });
    const next = jest.fn();

    const middleware = runCancelableHandler(
      function* (passOn: () => void) {
        passOn();
      },
      req,
      res,
      undefined,
      { next },
    );

    await middleware;
    jest.advanceTimersByTime(30);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.signal.aborted).toBe(true);
  });

  it('keeps running for the route behind a hook that settled', async () => {
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res, { timeout: 30 });

    await runCancelableHandler(() => undefined, req, res, undefined, { handsOn: () => true });
    jest.advanceTimersByTime(30);

    expect(state.signal.aborted).toBe(true);
  });

  it('reports to the lifecycle callbacks once however many wrappers inherit them', async () => {
    const { req, res } = createExchange();
    const onTimeout = jest.fn();
    ensureRequestCancelState(req, res, { onTimeout, timeout: 30 });

    const outcomes = [1, 2, 3].map(() => outcomeOf(runCancelableHandler(() => pending(), req, res, { onTimeout })));

    jest.advanceTimersByTime(30);
    await Promise.all(outcomes);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('adds no close listener per wrapped handler', () => {
    const { req, res } = createExchange();
    ensureRequestCancelState(req, res, { timeout: 30 });

    for (let layer = 0; layer < 12; layer += 1) {
      void outcomeOf(runCancelableHandler(() => pending(), req, res, { timeout: 30 }));
    }

    expect(res.listenerCount('close')).toBe(1);
  });

  it('adds no abort listener per wrapped handler', () => {
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res);

    for (let layer = 0; layer < 12; layer += 1) {
      void outcomeOf(runCancelableHandler(() => pending(), req, res));
    }

    // the one in-flight forwarder, however many layers
    expect(getEventListeners(state.signal, 'abort')).toHaveLength(1);
  });
});

describe('lifecycle callbacks', () => {
  it('reports a disconnect and not a timeout', async () => {
    const { req, res } = createExchange();
    const onDisconnect = jest.fn();
    const onTimeout = jest.fn();

    const outcome = outcomeOf(runCancelableHandler(() => pending(), req, res, { onDisconnect, onTimeout }));
    res.disconnect();
    await outcome;

    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect.mock.calls[0][0].message).toBe(CLIENT_DISCONNECTED);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('reports a deadline and not a disconnect', async () => {
    jest.useFakeTimers();

    try {
      const { req, res } = createExchange();
      const onDisconnect = jest.fn();
      const onTimeout = jest.fn();

      const outcome = outcomeOf(
        runCancelableHandler(
          function* () {
            yield pending();
          },
          req,
          res,
          { onDisconnect, onTimeout, timeout: 30 },
        ),
      );

      jest.advanceTimersByTime(30);
      await outcome;

      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(onTimeout.mock.calls[0][0].timedOut).toBe(true);
      expect(onDisconnect).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports a client that was already gone', async () => {
    const { req, res } = createExchange();
    res.destroyed = true;
    const onDisconnect = jest.fn();

    await outcomeOf(runCancelableHandler(() => pending(), req, res, { onDisconnect }));

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('inherits the callback the plugin registered', async () => {
    const { req, res } = createExchange();
    const onDisconnect = jest.fn();
    ensureRequestCancelState(req, res, { onDisconnect });

    const outcome = outcomeOf(runCancelableHandler(() => pending(), req, res));
    res.disconnect();
    await outcome;

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });
});

describe('in flight forwarder', () => {
  let uncaught: jest.Mock;

  beforeEach(() => {
    uncaught = jest.fn();
    process.on('uncaughtException', uncaught);
  });

  afterEach(() => {
    process.removeListener('uncaughtException', uncaught);
  });

  it('survives a strict shielded task that rejects the disconnect cancel', async () => {
    const { req, res } = createExchange();
    const first = pending({ shield: true, strict: true });
    const second = pending();

    void outcomeOf(runCancelableHandler(() => first, req, res, { shield: true, strict: true }));
    const follower = outcomeOf(runCancelableHandler(() => second, req, res));
    res.disconnect();

    // the task after the throwing one is still reached, and the abort dispatch reports nothing
    expect(isCancelError(await follower)).toBe(true);
    await flush();
    expect(uncaught).not.toHaveBeenCalled();
  });
});

describe('external signals', () => {
  it('cancels the handler when a caller supplied signal aborts', async () => {
    const { req, res } = createExchange();
    const controller = new AbortController();

    const outcome = outcomeOf(runCancelableHandler(() => pending(), req, res, { signal: controller.signal }));
    controller.abort();

    expect(isCancelError(await outcome)).toBe(true);
  });

  it('still honours the request signal alongside it', async () => {
    const { req, res } = createExchange();

    const outcome = outcomeOf(
      runCancelableHandler(() => pending(), req, res, { signal: [new AbortController().signal] }),
    );
    res.disconnect();

    expect(isCancelError(await outcome)).toBe(true);
  });

  it('never invokes the handler when a caller signal was already aborted', async () => {
    const { req, res } = createExchange();
    const handler = jest.fn(() => pending());

    const task = runCancelableHandler(handler, req, res, { signal: AbortSignal.abort() });

    expect(isCancelError(await outcomeOf(task))).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('never invokes a generator handler when one of several caller signals was already aborted', async () => {
    const { req, res } = createExchange();
    const handler = jest.fn(function* () {
      yield pending();
    });

    const task = runCancelableHandler(handler, req, res, {
      signal: [new AbortController().signal, AbortSignal.abort()],
    });

    expect(isCancelError(await outcomeOf(task))).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('still invokes the handler when every caller signal is live', async () => {
    const { req, res } = createExchange();
    const handler = jest.fn(() => 'done');

    const task = runCancelableHandler(handler, req, res, { signal: new AbortController().signal });

    expect(await task).toBe('done');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('cancel attribution', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('leaves a user cancel of a live request unattributed', async () => {
    const { req, res } = createExchange();
    const task = runCancelableHandler(() => pending(), req, res);
    const outcome = outcomeOf(task);

    task.cancel(new CancelError('user'));

    const error = (await outcome) as CancelError;

    expect(isCancelError(error)).toBe(true);
    expect(cancelStatusOf(error, 418)).toBeUndefined();
  });

  it('leaves a timeout the handler raised on its own unattributed', async () => {
    const { req, res } = createExchange();
    const task = runCancelableHandler(() => pending(), req, res);
    const outcome = outcomeOf(task);

    task.cancel(new CancelError('fetch timed out', { cause: new TimeoutError('fetch timed out') }));

    const error = (await outcome) as CancelError;

    expect(error.timedOut).toBe(true);
    expect(cancelStatusOf(error, 418)).toBeUndefined();
  });

  it('stamps a cancel derived from the request deadline with the deadline status', async () => {
    const { req, res } = createExchange();
    const task = runCancelableHandler(() => pending(), req, res, { timeout: { ms: 30, status: 504 } });
    const outcome = outcomeOf(task.then(() => undefined));

    jest.advanceTimersByTime(30);

    const error = (await outcome) as CancelError;

    stampDerivedCancel(error, getRequestState(req)!);

    expect(cancelStatusOf(error, 418)).toBe(504);
  });

  it('attributes a cancel that came from a route signal and answers 503 by default', async () => {
    const { req, res } = createExchange();
    const controller = new AbortController();
    const task = runCancelableHandler(() => pending(), req, res, { signal: controller.signal });
    const outcome = outcomeOf(task);

    controller.abort();

    const error = (await outcome) as CancelError;

    expect(cancelStatusOf(error, undefined)).toBe(503);
    expect(cancelStatusOf(error, 418)).toBe(418);
  });

  it('runs the decorator the request state carries on a deadline before it is delivered', async () => {
    const { req, res } = createExchange();
    const outcome = outcomeOf(runCancelableHandler(() => pending(), req, res, { timeout: 30 }));

    getRequestState(req)!.decorateCancel = (error) => {
      Object.assign(error, { marked: true });
    };

    jest.advanceTimersByTime(30);

    const error = (await outcome) as CancelError & { marked?: boolean };

    expect(error.marked).toBe(true);
  });

  it('stamps a fresh cancel derived after the deadline with the deadline status', async () => {
    const { req, res } = createExchange();
    const outcome = outcomeOf(runCancelableHandler(() => pending(), req, res, { timeout: { ms: 30, status: 504 } }));

    jest.advanceTimersByTime(30);
    await outcome;

    const fresh = new CancelError('derived after the deadline');
    stampDerivedCancel(fresh, getRequestState(req)!);

    expect(cancelStatusOf(fresh, 418)).toBe(504);
  });

  it('copies the stamp wins mark and headers of a shutdown onto a fresh derived cancel', async () => {
    const { req, res } = createExchange();
    const headers = { 'Retry-After': '5' };
    const outcome = outcomeOf(runCancelableHandler(() => pending(), req, res));
    const state = getRequestState(req)!;

    state.cancel(createShutdownError('closing', { status: 504, headers }));
    await outcome;

    const fresh = new CancelError('derived after the shutdown');
    stampDerivedCancel(fresh, state);

    expect(cancelStatusOf(fresh, 418)).toBe(504);
    expect(cancelHeadersOf(fresh)).toEqual(headers);
  });

  it('leaves a user cancel carrying status 499 unattributed on a live request', async () => {
    const { req, res } = createExchange();
    const task = runCancelableHandler(() => pending(), req, res);
    const outcome = outcomeOf(task);
    const state = getRequestState(req)!;

    task.cancel(Object.assign(new CancelError('user'), { status: 499 }));

    const error = (await outcome) as CancelError & { status?: number; expose?: boolean };

    stampDerivedCancel(error, state);

    expect(ownedStatusOf(error, state, 418)).toBeUndefined();
    expect(error.status).toBe(499);
    expect(error.expose).toBeUndefined();
  });

  it('leaves a deadline instance that rejects another live request unattributed', async () => {
    const owner = createExchange();
    const other = createExchange();
    const ownerOutcome = outcomeOf(
      runCancelableHandler(() => pending(), owner.req, owner.res, { timeout: { ms: 30, status: 504 } }),
    );

    jest.advanceTimersByTime(30);

    const deadline = (await ownerOutcome) as CancelError;
    const otherTask = runCancelableHandler(() => pending(), other.req, other.res);
    const otherOutcome = outcomeOf(otherTask);

    otherTask.cancel(deadline);

    const error = await otherOutcome;

    expect(error).toBe(deadline);
    expect(ownedStatusOf(error, getRequestState(other.req)!, 418)).toBeUndefined();
  });
});

describe('late failure of a signal-only handler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function settleMicrotasks(): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  }

  it('hands a plain failure that lands after the deadline to onLateFailure once', async () => {
    const { req, res } = createExchange();
    const onLateFailure = jest.fn();
    let fail: (reason: unknown) => void = () => undefined;
    const handler = () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      });

    const outcome = outcomeOf(runCancelableHandler(handler, req, res, { timeout: 50 }, { onLateFailure }));

    jest.advanceTimersByTime(50);
    expect(isCancelError(await outcome)).toBe(true);

    fail(new Error('late'));
    await settleMicrotasks();

    expect(onLateFailure).toHaveBeenCalledTimes(1);
    expect(onLateFailure).toHaveBeenCalledWith(expect.objectContaining({ message: 'late' }));
  });

  it('does not hand a late cancellation to onLateFailure', async () => {
    const { req, res } = createExchange();
    const onLateFailure = jest.fn();
    let fail: (reason: unknown) => void = () => undefined;
    const handler = () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      });

    const outcome = outcomeOf(runCancelableHandler(handler, req, res, { timeout: 50 }, { onLateFailure }));

    jest.advanceTimersByTime(50);
    await outcome;

    fail(new CancelError('late cancel'));
    await settleMicrotasks();

    expect(onLateFailure).not.toHaveBeenCalled();
  });

  it('does not hand a failure raised while the request is still running to onLateFailure', async () => {
    const { req, res } = createExchange();
    const onLateFailure = jest.fn();
    let fail: (reason: unknown) => void = () => undefined;
    const handler = () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      });

    const outcome = outcomeOf(runCancelableHandler(handler, req, res, { timeout: 50 }, { onLateFailure }));

    fail(new Error('early'));
    await outcome;
    await settleMicrotasks();

    expect(onLateFailure).not.toHaveBeenCalled();
  });

  it('keeps a late hook that throws from escaping into the process', async () => {
    const { req, res } = createExchange();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const onLateFailure = jest.fn(() => {
      throw new Error('hook broke');
    });
    let fail: (reason: unknown) => void = () => undefined;
    const handler = () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      });

    const outcome = outcomeOf(runCancelableHandler(handler, req, res, { timeout: 50 }, { onLateFailure }));

    jest.advanceTimersByTime(50);
    await outcome;

    fail(new Error('late'));
    await settleMicrotasks();

    expect(onLateFailure).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith('[@cancjs/server] late failure hook failed', expect.any(Error));

    consoleError.mockRestore();
  });
});
