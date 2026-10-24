import { CancelablePromise, CancelError, isCancelError, setPromiseImpl } from '@cancjs/promise';
import { once } from 'events';
import { createServer, globalAgent, IncomingMessage, request, Server, ServerResponse } from 'http';
import { connect, Socket } from 'net';

import { createExchange, FakeResponse, FakeServer, flush, outcomeOf, pending } from './__tests__/fakes';
import { getRequestRegistry, recordRequest } from './holder';
import { ensureRequestCancelState, getNodeRequestSignal } from './node-signal';
import { SERVER_SHUTDOWN } from './reasons';
import { runCancelableHandler } from './run';
import { shutdownServer } from './shutdown';

describe('graceful shutdown', () => {
  it('closes the server and its idle connections', async () => {
    const server = new FakeServer();

    const result = await shutdownServer(server);

    expect(server.closed).toBe(1);
    expect(server.idleClosed).toBe(1);
    expect(server.allClosed).toBe(0);
    expect(result).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });

  it('leaves the server listening when asked to', async () => {
    const server = new FakeServer();

    await shutdownServer(server, { closeServer: false });

    expect(server.closed).toBe(0);
    expect(server.idleClosed).toBe(0);
    expect(server.allClosed).toBe(0);
  });

  it('works against a server with none of the newer teardown methods', async () => {
    const server = { close: jest.fn((callback?: () => void) => callback?.()) };

    expect(await shutdownServer(server)).toEqual({ canceled: 0, completed: 0, timedOut: false });
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it('cancels a live request with the shutdown reason once the grace window ends', async () => {
    jest.useFakeTimers();

    try {
      const server = new FakeServer();
      const { req, res } = createExchange(server);
      let settled = false;

      const outcome = answer(
        runCancelableHandler(
          function* () {
            yield pending();
          },
          req,
          res,
        ),
        res,
      ).finally(() => {
        settled = true;
      });

      const shutdown = shutdownServer(server, { cancelAfter: 100 });
      await jest.advanceTimersByTimeAsync(99);

      expect(settled).toBe(false);

      await jest.advanceTimersByTimeAsync(2);
      const result = await shutdown;
      const error = (await outcome) as CancelError;

      expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
      expect(isCancelError(error)).toBe(true);
      expect(error.message).toBe(SERVER_SHUTDOWN);
      expect(server.allClosed).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels a live request at once when asked to cancel on start', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    const outcome = answer(
      runCancelableHandler(
        function* () {
          yield pending();
        },
        req,
        res,
      ),
      res,
    );

    const result = await shutdownServer(server, { cancelAfter: 0 });
    const error = (await outcome) as CancelError;

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect(isCancelError(error)).toBe(true);
    expect(error.message).toBe(SERVER_SHUTDOWN);
  });

  it('cancels live requests across several connections', async () => {
    const server = new FakeServer();
    const first = createExchange(server);
    const second = createExchange(server);

    const outcomes = [first, second].map(({ req, res }) =>
      answer(
        runCancelableHandler(
          function* () {
            yield pending();
          },
          req,
          res,
        ),
        res,
      ),
    );

    expect((await shutdownServer(server, { cancelAfter: 0 })).canceled).toBe(2);
    expect((await Promise.all(outcomes)).every(isCancelError)).toBe(true);
  });

  it('lets work that cannot be interrupted finish inside the window', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);
    const state = ensureRequestCancelState(req, res);

    const work = new CancelablePromise<string>(
      (resolve) => {
        setTimeout(() => resolve('finished'), 5);
      },
      { shield: true },
    );
    state.live.add(work);
    void answer(work, res);

    expect(await shutdownServer(server, { cancelAfter: 2000 })).toEqual({ canceled: 0, completed: 1, timedOut: false });
  });

  it('does not disturb a handler that already finished', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    expect(await runCancelableHandler(() => 'done', req, res)).toBe('done');

    const shutdown = shutdownServer(server);
    res.end();

    expect(await shutdown).toEqual({ canceled: 0, completed: 1, timedOut: false });
  });

  it('counts a handler that failed on its own as completed', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    const outcome = outcomeOf(runCancelableHandler(() => CancelablePromise.reject(new Error('boom')), req, res));

    expect(await outcome).toEqual(new Error('boom'));

    const shutdown = shutdownServer(server);
    res.end();

    expect((await shutdown).completed).toBe(1);
  });

  it('gives up on a handler that ignores the cancel', async () => {
    jest.useFakeTimers();

    try {
      const server = new FakeServer();
      const { req, res } = createExchange(server);
      ensureRequestCancelState(req, res).live.add(pending({ shield: true }));

      const shutdown = shutdownServer(server, { cancelAfter: 100 });
      // the grace timer, then the one turn left for answers to the cancel
      jest.advanceTimersByTime(1101);

      // the shielded task never answers: the cancel is counted, the window ran to closeAfter
      expect(await shutdown).toEqual({ canceled: 1, completed: 0, timedOut: true });
      expect(server.allClosed).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns the running shutdown to a second caller', () => {
    const server = new FakeServer();
    const first = shutdownServer(server);

    expect(shutdownServer(server)).toBe(first);
    expect(server.closed).toBe(1);
  });

  it('cancels background work the handler never awaited', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    // a request-scoped consumer of the signal: never handed to the handler, so it is not in
    // state.live and only the signal itself can reach it
    const detached = outcomeOf(pending({ signal: getNodeRequestSignal(req, res) }));

    const handled = answer(
      runCancelableHandler(
        function* () {
          yield pending();
        },
        req,
        res,
      ),
      res,
    );

    const result = await shutdownServer(server, { cancelAfter: 0 });
    const error = (await detached) as CancelError;

    expect(isCancelError(error)).toBe(true);
    expect(error.message).toBe(SERVER_SHUTDOWN);
    expect(isCancelError(await handled)).toBe(true);
    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
  });

  it('does not report a shutdown as a disconnect or a deadline', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);
    const onDisconnect = jest.fn();
    const onTimeout = jest.fn();

    void answer(
      runCancelableHandler(
        function* () {
          yield pending();
        },
        req,
        res,
        { onDisconnect, onTimeout },
      ),
      res,
    );

    await shutdownServer(server, { cancelAfter: 0 });

    expect(onDisconnect).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('hands a live task the signal reason itself', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);
    const signal = getNodeRequestSignal(req, res);
    const outcome = answer(
      runCancelableHandler(
        function* () {
          yield pending();
        },
        req,
        res,
      ),
      res,
    );

    await shutdownServer(server, { cancelAfter: 0 });

    expect(await outcome).toBe(signal.reason);
  });

  it('gives a disconnect reason no status or statusCode', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);
    const signal = getNodeRequestSignal(req, res);

    res.disconnect();

    expect(isCancelError(signal.reason)).toBe(true);
    expect(signal.reason).not.toHaveProperty('status');
    expect(signal.reason).not.toHaveProperty('statusCode');
  });

  it('cancels the signal of a request that has no task in flight yet', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);
    const signal = getNodeRequestSignal(req, res);
    signal.addEventListener('abort', () => res.end());

    expect(await shutdownServer(server, { cancelAfter: 0 })).toEqual({ canceled: 1, completed: 0, timedOut: false });
    expect(signal.aborted).toBe(true);
    expect((signal.reason as CancelError).message).toBe(SERVER_SHUTDOWN);
  });

  it('ignores a request whose response is already over', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    void outcomeOf(runCancelableHandler(() => pending(), req, res));
    res.end();

    expect(getRequestRegistry(server)?.open.size).toBe(0);
    expect(await shutdownServer(server)).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });

  it('counts a tracked request whose response closed before shutdown and has nothing in flight', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    ensureRequestCancelState(req, res);
    // flagged closed before its close event dispatches, so the registry still holds it at admission
    Object.assign(res, { closed: true });

    await expect(shutdownServer(server, { cancelAfter: 50 })).resolves.toEqual({
      canceled: 0,
      completed: 1,
      timedOut: false,
    });
  });

  it('cancels a request that gains cancel state after the grace window ended', async () => {
    jest.useFakeTimers();

    try {
      const server = new FakeServer();
      const { req, res } = createExchange(server);
      recordRequest(getRequestRegistry(server, true)!, req, res);

      const shutdown = shutdownServer(server, { cancelAfter: 100 });
      // only the grace timer fires, the turn that settles the result is still queued
      jest.advanceTimersToNextTimer();
      const signal = getNodeRequestSignal(req, res);

      expect(signal.aborted).toBe(true);
      expect((signal.reason as Error).message).toBe(SERVER_SHUTDOWN);
      // the request owes its answer, so the window holds until closeAfter (cancelAfter + 1000)
      await jest.advanceTimersByTimeAsync(1000);
      await shutdown;
    } finally {
      jest.useRealTimers();
    }
  });

  it('finishes the shutdown when a strict, shielded task rejects its own cancel', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    ensureRequestCancelState(req, res).live.add(pending({ shield: true, strict: true }));

    await expect(shutdownServer(server, { cancelAfter: 50 })).resolves.toEqual(
      expect.objectContaining({ timedOut: true }),
    );
    expect(server.closed).toBe(1);
  });

  it('allows a real shutdown after a soft shutdown completes', async () => {
    const server = new FakeServer();

    const first = shutdownServer(server, { closeServer: false });
    await first;

    const second = shutdownServer(server);
    expect(second).not.toBe(first);
    expect(server.closed).toBe(1);
    await second;
  });

  it('returns an instance of the registered promise class', () => {
    class CustomPromise<T> extends CancelablePromise<T> {}
    setPromiseImpl(CustomPromise as any);

    try {
      const server = new FakeServer();
      const shutdown = shutdownServer(server);

      expect(shutdown instanceof CustomPromise).toBe(true);
    } finally {
      setPromiseImpl(CancelablePromise as any);
    }
  });

  it('clears the shutdown state when the shutdown promise is canceled', async () => {
    jest.useFakeTimers();

    try {
      const server = new FakeServer();
      const { req, res } = createExchange(server);
      ensureRequestCancelState(req, res).live.add(pending({ shield: true }));

      const first = shutdownServer(server, { cancelAfter: 50 });
      first.cancel();

      const second = shutdownServer(server, { cancelAfter: 100 });
      expect(second).not.toBe(first);
      // race loser window timer clears a few jobs after the cancel
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
      // the second shutdown's grace timer, nothing left over from the first
      expect(jest.getTimerCount()).toBe(1);

      jest.advanceTimersByTime(50);
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
      expect(shutdownServer(server)).toBe(second);

      jest.advanceTimersByTime(1050);
      await second;

      expect(server.allClosed).toBe(1);
      expect(server.closed).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('shutdown argument and grace edges', () => {
  it('names the argument when the server is missing', () => {
    expect(() => shutdownServer(undefined as never)).toThrow(TypeError);
    expect(() => shutdownServer(undefined as never)).toThrow(/server.*undefined/);
    expect(() => shutdownServer(null as never)).toThrow(/server.*null/);
  });

  describe.each([
    ['an infinite grace', Infinity],
    ['a grace past the timer ceiling', 2 ** 31],
  ])('with %s', (_label, timeout) => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('keeps waiting for the response instead of giving up early', async () => {
      const server = new FakeServer();
      const { req, res } = createExchange(server);

      runCancelableHandler(
        function* () {
          yield pending();
        },
        req,
        res,
      ).catch(() => undefined);

      let result: unknown;
      void shutdownServer(server, { cancelAfter: 0, closeAfter: timeout }).then((value) => {
        result = value;
      });

      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);

      expect(result).toBeUndefined();
      expect(server.allClosed).toBe(0);

      res.end();
      await jest.advanceTimersByTimeAsync(0);

      expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
    });
  });
});

describe('graceful shutdown over a real socket', () => {
  const servers: Server[] = [];
  const sockets: Socket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.destroy();
    }

    // the default client pool keeps connections alive, which is the case these exercise
    globalAgent.destroy();

    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  });

  it('lets a plain route answer inside the grace window', async () => {
    const entered = deferred();
    const gate = deferred();
    const { port, server } = await listen((_req, res) => {
      entered.resolve();
      void gate.promise.then(() => res.end('plain ok'));
    });
    const answer = get(port, '/plain');
    await entered.promise;
    const shutdown = shutdownServer(server, { cancelAfter: 300 });
    gate.resolve();

    expect(await answer).toMatchObject({ body: 'plain ok', status: 200 });
    expect((await shutdown).timedOut).toBe(false);
  });

  it('resets a request still running when the grace window closes', async () => {
    const entered = deferred();
    const { port, server } = await listen(() => {
      entered.resolve();
    });

    const answer = get(port, '/slow');
    await entered.promise;
    const startedAt = Date.now();
    const result = await shutdownServer(server, { cancelAfter: 300 });
    const outcome = await answer;

    expect(outcome.error).toBe('ECONNRESET');
    expect(outcome.at - startedAt).toBeGreaterThanOrEqual(250);
    expect(result.timedOut).toBe(false);
  });

  describe.each([
    ['a wrapped', true],
    ['a plain', false],
  ])('after %s response', (_label, wrapped) => {
    it('gives the next request on the same client the same outcome', async () => {
      const entered = deferred();
      const gate = deferred();
      const { port, server } = await listen((req, res) => {
        if (req.url === '/warm') {
          void runCancelableHandler(() => 'warm', req, res);
          res.end('warm');

          return;
        }

        if (req.url === '/next') {
          res.end('next');

          return;
        }

        if (wrapped) {
          void runCancelableHandler(() => 'next', req, res);
        }
        entered.resolve();
        void gate.promise.then(() => res.end('first'));
      });

      // an earlier wrapped request is how this layer meets the server, plain routes included
      await get(port, '/warm');

      // the default client pool keeps the connection alive and reuses it unless told otherwise
      const first = get(port, '/first');
      await entered.promise;
      const shutdown = shutdownServer(server, { cancelAfter: 1000 });
      gate.resolve();
      const firstOutcome = await first;
      const nextOutcome = await get(port, '/next');

      expect(firstOutcome).toMatchObject({ body: 'first', connection: 'close', status: 200 });
      expect(nextOutcome.error).toBe('ECONNREFUSED');
      expect((await shutdown).timedOut).toBe(false);
    });
  });

  it('keeps no timer besides the grace timer while it drains', async () => {
    const entered = deferred();
    const gate = deferred();
    const { port, server } = await listen((req, res) => {
      void runCancelableHandler(() => 'next', req, res);
      entered.resolve();
      void gate.promise.then(() => res.end('done'));
    });

    const answer = get(port, '/hold');
    await entered.promise;
    const before = countTimers();
    const shutdown = shutdownServer(server, { cancelAfter: 1000 });
    const during = countTimers();
    gate.resolve();

    expect(await answer).toMatchObject({ status: 200 });
    await shutdown;
    expect(during - before).toBe(1);
  });

  it('closes a kept-alive connection within one turn of its response finishing', async () => {
    const entered = deferred();
    const gate = deferred();
    const checked = deferred();
    let closingInTurn: boolean | undefined;
    const { port, server } = await listen((req, res) => {
      const socket = req.socket;
      void runCancelableHandler(() => 'next', req, res);
      // the head went out before the shutdown, so it still says keep-alive
      res.writeHead(200, { 'Content-Length': '5' });
      res.write('hel');
      entered.resolve();
      void gate.promise.then(() => {
        res.once('close', () => {
          setImmediate(() => {
            closingInTurn = socket.writableEnded || socket.destroyed;
            checked.resolve();
          });
        });
        res.end('lo');
      });
    });

    const client = await rawClient(port);
    client.resume();
    const closed = once(client, 'close');
    client.write('GET /held HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await entered.promise;
    const shutdown = shutdownServer(server, { cancelAfter: 1000 });
    gate.resolve();
    await checked.promise;
    await closed;

    expect(closingInTurn).toBe(true);
    expect((await shutdown).timedOut).toBe(false);
  });

  it('answers a request arriving on a kept-alive connection with Connection close', async () => {
    const firstEntered = deferred();
    const lateEntered = deferred();
    const firstGate = deferred();
    let lateSignalAborted: boolean | undefined;
    const { port, server } = await listen((req, res) => {
      if (req.url === '/first') {
        res.writeHead(200, { 'Content-Length': '5' });
        res.write('fir');
        firstEntered.resolve();
        void firstGate.promise.then(() => res.end('st'));

        return;
      }

      lateSignalAborted = getNodeRequestSignal(req, res).aborted;
      res.end('late');
      lateEntered.resolve();
    });

    const client = await rawClient(port);
    let received = '';
    client.on('data', (chunk: Buffer) => {
      received += chunk.toString('latin1');
    });
    const closed = once(client, 'close');

    client.write('GET /first HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await firstEntered.promise;
    const shutdown = shutdownServer(server, { cancelAfter: 1000 });
    client.write('GET /late HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await lateEntered.promise;
    firstGate.resolve();

    const result = await shutdown;
    await closed;
    const responses = received.split(/(?=HTTP\/1\.1 )/);

    expect(responses).toHaveLength(2);
    expect(responses[0]).toMatch(/^HTTP\/1\.1 200[\s\S]*first$/);
    expect(responses[1]).toMatch(/^HTTP\/1\.1 200/);
    expect(responses[1]).toMatch(/\r\nConnection: close\r\n/i);
    expect(responses[1]).toMatch(/late$/);
    expect(lateSignalAborted).toBe(false);
    expect(result.timedOut).toBe(false);
  });

  it('counts one request once however many wrapped layers it went through', async () => {
    const entered = deferred();
    const { port, server } = await listen((req, res) => {
      const layer = () => runCancelableHandler(() => 'next', req, res);

      void layer();
      void layer();
      runCancelableHandler(
        function* () {
          yield pending();
        },
        req,
        res,
      ).then(undefined, () => {
        res.statusCode = 503;
        res.end('canceled');
      });
      entered.resolve();
    });

    const answer = get(port, '/stack');
    await entered.promise;
    const result = await shutdownServer(server, { cancelAfter: 200 });

    expect(await answer).toMatchObject({ status: 503 });
    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
  });

  it('does not count a request again when a task settles after its response closed', async () => {
    const server = new FakeServer();
    const first = createExchange(server);
    const second = createExchange(server);
    const firstState = ensureRequestCancelState(first.req, first.res);
    ensureRequestCancelState(second.req, second.res);
    let settled = false;

    const shutdown = shutdownServer(server, { cancelAfter: 1000 });
    void shutdown.then(() => {
      settled = true;
    });

    first.res.end();
    // the fake response has no closed flag, so a late task is tracked like one started mid response
    firstState.watch?.(CancelablePromise.resolve());
    await flush();

    expect(settled).toBe(false);

    second.res.end();

    expect(await shutdown).toEqual({ canceled: 0, completed: 2, timedOut: false });
  });

  it('counts a request whose response finished during the drain as completed', async () => {
    const entered = deferred();
    const gate = deferred();
    const { port, server } = await listen((req, res) => {
      void runCancelableHandler(() => 'next', req, res);
      entered.resolve();
      void gate.promise.then(() => res.end('done'));
    });

    const answer = get(port, '/finish');
    await entered.promise;
    const shutdown = shutdownServer(server, { cancelAfter: 1000 });
    gate.resolve();

    expect(await answer).toMatchObject({ body: 'done', status: 200 });
    expect(await shutdown).toEqual({ canceled: 0, completed: 1, timedOut: false });
  });

  it('lets a wrapped handler finish inside the grace window', async () => {
    const entered = deferred();
    const gate = deferred();
    const { port, server } = await listen((req, res) => {
      answerWith(
        res,
        runCancelableHandler(
          function* () {
            entered.resolve();
            yield gate.promise;

            return 'done';
          },
          req,
          res,
        ),
      );
    });

    const answer = get(port, '/wrapped');
    await entered.promise;
    const shutdown = shutdownServer(server, { cancelAfter: 1000 });
    gate.resolve();

    expect(await answer).toMatchObject({
      body: 'done',
      connection: 'close',
      status: 200,
    });
    expect(await shutdown).toEqual({ canceled: 0, completed: 1, timedOut: false });
  });

  it('cancels a wrapped handler still running when the grace window ends', async () => {
    const entered = deferred();
    let cleanedUp = false;
    const { port, server } = await listen((req, res) => {
      answerWith(
        res,
        runCancelableHandler(
          function* () {
            entered.resolve();
            try {
              yield pending();
            } finally {
              cleanedUp = true;
            }
          },
          req,
          res,
        ),
      );
    });

    const answer = get(port, '/slow');
    await entered.promise;
    const startedAt = Date.now();
    const result = await shutdownServer(server, { cancelAfter: 500 });
    const outcome = await answer;

    expect(outcome).toMatchObject({
      body: SERVER_SHUTDOWN,
      connection: 'close',
      status: 503,
    });
    expect(outcome.at - startedAt).toBeGreaterThanOrEqual(450);
    expect(cleanedUp).toBe(true);
    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
  });

  it('runs a wrapped handler for a request arriving on a kept-alive connection', async () => {
    const firstEntered = deferred();
    const lateEntered = deferred();
    const firstGate = deferred();
    const { port, server } = await listen((req, res) => {
      if (req.url === '/first') {
        void runCancelableHandler(() => 'next', req, res);
        res.writeHead(200, { 'Content-Length': '5' });
        res.write('fir');
        firstEntered.resolve();
        void firstGate.promise.then(() => res.end('st'));

        return;
      }

      answerWith(
        res,
        runCancelableHandler(
          function* () {
            lateEntered.resolve();
            yield Promise.resolve();

            return 'late';
          },
          req,
          res,
        ),
      );
    });

    const client = await rawClient(port);
    let received = '';
    client.on('data', (chunk: Buffer) => {
      received += chunk.toString('latin1');
    });
    const closed = once(client, 'close');

    client.write('GET /first HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await firstEntered.promise;
    const shutdown = shutdownServer(server, { cancelAfter: 1000 });
    client.write('GET /late HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await lateEntered.promise;
    firstGate.resolve();

    const result = await shutdown;
    await closed;
    const responses = received.split(/(?=HTTP\/1\.1 )/);

    expect(responses).toHaveLength(2);
    expect(responses[1]).toMatch(/^HTTP\/1\.1 200/);
    expect(responses[1]).toMatch(/\r\nConnection: close\r\n/i);
    expect(responses[1]).toMatch(/late$/);
    expect(result).toEqual({ canceled: 0, completed: 2, timedOut: false });
  });

  it('answers a pipelined request before the connection is closed', async () => {
    const firstEntered = deferred();
    const firstGate = deferred();
    const firstClosed = deferred();
    const { port, server } = await listen((req, res) => {
      if (req.url === '/first') {
        res.writeHead(200, { 'Content-Length': '5' });
        res.write('fir');
        firstEntered.resolve();
        res.once('close', () => setImmediate(firstClosed.resolve));
        void firstGate.promise.then(() => res.end('st'));

        return;
      }

      // answers only once the first response is over, which is when its socket would be closed
      void firstClosed.promise.then(() => res.end('second'));
    });
    // met before any request, so both are known to the shutdown
    getRequestRegistry(server, true);

    const client = await rawClient(port);
    let received = '';
    client.on('data', (chunk: Buffer) => {
      received += chunk.toString('latin1');
    });
    const closed = once(client, 'close');

    // both requests are on the wire before the shutdown, and the first head already said keep-alive
    client.write('GET /first HTTP/1.1\r\nHost: localhost\r\n\r\n' + 'GET /second HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await firstEntered.promise;
    const shutdown = shutdownServer(server, { cancelAfter: 1000 });
    firstGate.resolve();

    const result = await shutdown;
    await closed;
    const responses = received.split(/(?=HTTP\/1\.1 )/);

    expect(responses).toHaveLength(2);
    expect(responses[0]).toMatch(/first$/);
    expect(responses[1]).toMatch(/^HTTP\/1\.1 200/);
    expect(responses[1]).toMatch(/second$/);
    expect(result).toEqual({ canceled: 0, completed: 2, timedOut: false });
  });

  it('counts a wrapped request that arrived during the drain and outlived it as canceled', async () => {
    const firstEntered = deferred();
    const lateEntered = deferred();
    const firstGate = deferred();
    const { port, server } = await listen((req, res) => {
      if (req.url === '/first') {
        void runCancelableHandler(() => 'next', req, res);
        res.writeHead(200, { 'Content-Length': '5' });
        res.write('fir');
        firstEntered.resolve();
        void firstGate.promise.then(() => res.end('st'));

        return;
      }

      answerWith(
        res,
        runCancelableHandler(
          function* () {
            lateEntered.resolve();
            yield pending();
          },
          req,
          res,
        ),
      );
    });

    const client = await rawClient(port);
    let received = '';
    client.on('data', (chunk: Buffer) => {
      received += chunk.toString('latin1');
    });
    const closed = once(client, 'close');

    client.write('GET /first HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await firstEntered.promise;
    const shutdown = shutdownServer(server, { cancelAfter: 200 });
    client.write('GET /late HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await lateEntered.promise;
    firstGate.resolve();

    const result = await shutdown;
    await closed;
    const responses = received.split(/(?=HTTP\/1\.1 )/);

    expect(responses).toHaveLength(2);
    expect(responses[1]).toMatch(/^HTTP\/1\.1 503/);
    expect(responses[1]).toContain(SERVER_SHUTDOWN);
    expect(result).toEqual({ canceled: 1, completed: 1, timedOut: false });
  });

  it('cancels a wrapped handler at once when asked to cancel on start', async () => {
    const entered = deferred();
    const { port, server } = await listen((req, res) => {
      answerWith(
        res,
        runCancelableHandler(
          function* () {
            entered.resolve();
            yield pending();
          },
          req,
          res,
        ),
      );
    });

    const answer = get(port, '/stream');
    await entered.promise;
    // a window this long only ends early because the handler was canceled at the start
    const result = await shutdownServer(server, {
      cancelAfter: 0,
      closeAfter: 60_000,
    });

    expect(await answer).toMatchObject({ body: SERVER_SHUTDOWN, status: 503 });
    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
  });

  it('does not track a signal asked for after the response closed', async () => {
    const lateSignals: boolean[] = [];
    let asked = deferred();
    const { port, server } = await listen((req, res) => {
      res.end('ok');
      res.on('close', () => {
        setImmediate(() => {
          lateSignals.push(getNodeRequestSignal(req, res).aborted);
          void runCancelableHandler(() => 'late', req, res, {
            timeout: 60_000,
          });
          asked.resolve();
        });
      });
    });
    for (const path of ['/a', '/b', '/c']) {
      await get(port, path);
      await asked.promise;
      asked = deferred();
    }

    expect(lateSignals).toEqual([false, false, false]);
    expect(getRequestRegistry(server)?.open.size ?? 0).toBe(0);
    expect(await shutdownServer(server, { cancelAfter: 1000 })).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });

  async function listen(
    handler: (req: IncomingMessage, res: ServerResponse) => void,
  ): Promise<{ port: number; server: Server }> {
    const server = createServer(handler);
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a bound tcp address');
    }

    return { port: address.port, server };
  }

  async function rawClient(port: number): Promise<Socket> {
    const client = connect(port, '127.0.0.1');
    sockets.push(client);
    client.on('error', () => {});
    await once(client, 'connect');

    return client;
  }
});

/** Answers a real response from a handler task: its value, or a 503 carrying the cancel reason. */
function answerWith(res: ServerResponse, task: CancelablePromise<unknown>): void {
  task.then(
    (value) => res.end(String(value)),
    (error: Error) => {
      if (!res.headersSent) {
        res.statusCode = 503;
      }
      res.end(error.message);
    },
  );
}

/** Answers the response once the task settles, the way every adapter does. */
function answer(task: CancelablePromise<unknown>, res: FakeResponse): Promise<unknown> {
  return outcomeOf(task).then((outcome) => {
    res.end();

    return outcome;
  });
}

interface IClientOutcome {
  at: number;
  body?: string;
  connection?: string;
  error?: string;
  status?: number;
}

function get(port: number, path: string): Promise<IClientOutcome> {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', path, port }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          at: Date.now(),
          body,
          connection: res.headers.connection,
          status: res.statusCode,
        });
      });
      res.on('error', (error: NodeJS.ErrnoException) => resolve({ at: Date.now(), error: error.code }));
    });
    req.on('error', (error: NodeJS.ErrnoException) => resolve({ at: Date.now(), error: error.code }));
    req.end();
  });
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

function countTimers(): number {
  return process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
}

describe('shutdown cancel point', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function pendingRequest(server: FakeServer): void {
    const { req, res } = createExchange(server);
    answer(
      runCancelableHandler(
        function* () {
          yield pending();
        },
        req,
        res,
      ),
      res,
    ).catch(() => undefined);
  }

  it('cancels in-flight handlers at 10_000 by default', async () => {
    const server = new FakeServer();
    pendingRequest(server);

    let result: unknown;
    void shutdownServer(server).then((value) => {
      result = value;
    });
    await jest.advanceTimersByTimeAsync(9_999);

    expect(result).toBeUndefined();

    await jest.advanceTimersByTimeAsync(2);

    // the handler answers the cancel, so the window closes at the cancel point, not at closeAfter
    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
  });

  it('cancels at closeAfter minus 1_000 when only closeAfter is set', async () => {
    const server = new FakeServer();
    pendingRequest(server);

    let result: unknown;
    void shutdownServer(server, { closeAfter: 3_000 }).then((value) => {
      result = value;
    });
    await jest.advanceTimersByTimeAsync(1_999);

    expect(result).toBeUndefined();

    await jest.advanceTimersByTimeAsync(2);

    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
  });

  it('throws a RangeError naming both values when cancelAfter is greater than closeAfter', () => {
    const server = new FakeServer();

    expect(() => shutdownServer(server, { cancelAfter: 5_000, closeAfter: 4_000 })).toThrow(RangeError);
    expect(() => shutdownServer(server, { cancelAfter: 5_000, closeAfter: 4_000 })).toThrow(/5000.*4000/);
  });
});
