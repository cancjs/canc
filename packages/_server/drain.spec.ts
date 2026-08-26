import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';

import { createExchange, FakeServer, outcomeOf, pending } from './__tests__/fakes';
import { drainServer } from './drain';
import { getLiveRequests } from './holder';
import { ensureRequestCancelState } from './node-signal';
import { SERVER_SHUTDOWN } from './reasons';
import { runCancelableHandler } from './run';

describe('graceful drain', () => {
  it('closes the server and kills the stragglers', async () => {
    const server = new FakeServer();

    const result = await drainServer(server);

    expect(server.closed).toBe(1);
    expect(server.idleClosed).toBe(1);
    expect(server.allClosed).toBe(1);
    expect(result).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });

  it('leaves the server listening when asked to', async () => {
    const server = new FakeServer();

    await drainServer(server, { closeServer: false });

    expect(server.closed).toBe(0);
    expect(server.allClosed).toBe(1);
  });

  it('works against a server with none of the newer teardown methods', async () => {
    const server = { close: jest.fn() };

    expect(await drainServer(server)).toEqual({ canceled: 0, completed: 0, timedOut: false });
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it('cancels a live request with the shutdown reason', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    const outcome = outcomeOf(
      runCancelableHandler(
        function* () {
          yield pending();
        },
        req,
        res,
      ),
    );

    const result = await drainServer(server);
    const error = (await outcome) as CancelError;

    expect(result.canceled).toBe(1);
    expect(result.timedOut).toBe(false);
    expect(isCancelError(error)).toBe(true);
    expect(error.message).toBe(SERVER_SHUTDOWN);
  });

  it('cancels live requests across several connections', async () => {
    const server = new FakeServer();
    const first = createExchange(server);
    const second = createExchange(server);

    const outcomes = [first, second].map(({ req, res }) =>
      outcomeOf(
        runCancelableHandler(
          function* () {
            yield pending();
          },
          req,
          res,
        ),
      ),
    );

    expect((await drainServer(server)).canceled).toBe(2);
    expect((await Promise.all(outcomes)).every(isCancelError)).toBe(true);
  });

  it('lets work that cannot be interrupted finish inside the window', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);
    const state = ensureRequestCancelState(req, res);

    state.live.add(
      new CancelablePromise<string>(
        (resolve) => {
          setTimeout(() => resolve('finished'), 5);
        },
        { shield: true },
      ),
    );

    expect(await drainServer(server, { timeout: 2000 })).toEqual({
      canceled: 0,
      completed: 1,
      timedOut: false,
    });
  });

  it('does not disturb a handler that already finished', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    expect(await runCancelableHandler(() => 'done', req, res)).toBe('done');
    expect((await drainServer(server)).completed).toBe(1);
  });

  it('counts a handler that failed on its own as completed', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    const outcome = outcomeOf(runCancelableHandler(() => CancelablePromise.reject(new Error('boom')), req, res));

    expect(await outcome).toEqual(new Error('boom'));
    expect((await drainServer(server)).completed).toBe(1);
  });

  it('gives up on a handler that ignores the cancel', async () => {
    jest.useFakeTimers();

    try {
      const server = new FakeServer();
      const { req, res } = createExchange(server);
      ensureRequestCancelState(req, res).live.add(pending({ shield: true }));

      const drain = drainServer(server, { timeout: 100 });
      jest.advanceTimersByTime(100);

      expect(await drain).toEqual({ canceled: 0, completed: 0, timedOut: true });
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns the running drain to a second caller', () => {
    const server = new FakeServer();
    const first = drainServer(server);

    expect(drainServer(server)).toBe(first);
    expect(server.closed).toBe(1);
  });

  it('ignores a request whose response is already over', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    void outcomeOf(runCancelableHandler(() => pending(), req, res));
    res.end();

    expect(getLiveRequests(server)?.size).toBe(0);
    expect(await drainServer(server)).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });
});
