import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';

import { createExchange, flush, outcomeOf, pending } from './__tests__/fakes';
import { getRequestState } from './holder';
import { ensureRequestCancelState } from './node-signal';
import { CLIENT_DISCONNECTED, HANDLER_TIMEOUT } from './reasons';
import { mergeHandlerOptions, runCancelableHandler } from './run';
import { IStatusCancelError } from './timeout';

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
});
