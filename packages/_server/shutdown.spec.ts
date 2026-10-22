import { CancelablePromise, CancelError, isCancelError, setPromiseImpl } from '@cancjs/promise';
import { once } from 'events';
import { createServer, globalAgent, IncomingMessage, request, Server, ServerResponse } from 'http';
import { connect, Socket } from 'net';

import { createExchange, FakeResponse, FakeServer, outcomeOf, pending } from './__tests__/fakes';
import { getLiveRequests } from './holder';
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

  it('cancels a live request with the shutdown reason', async () => {
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

    const result = await shutdownServer(server);
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

    expect((await shutdownServer(server)).canceled).toBe(2);
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

    expect(await shutdownServer(server, { timeout: 2000 })).toEqual({
      canceled: 0,
      completed: 1,
      timedOut: false,
    });
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

      const shutdown = shutdownServer(server, { timeout: 100 });
      jest.advanceTimersByTime(100);

      expect(await shutdown).toEqual({ canceled: 0, completed: 0, timedOut: true });
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

    const result = await shutdownServer(server);
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

    await shutdownServer(server);

    expect(onDisconnect).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('cancels the signal of a request that has no task in flight yet', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);
    const signal = getNodeRequestSignal(req, res);
    signal.addEventListener('abort', () => res.end());

    expect(await shutdownServer(server)).toEqual({ canceled: 0, completed: 1, timedOut: false });
    expect(signal.aborted).toBe(true);
    expect((signal.reason as CancelError).message).toBe(SERVER_SHUTDOWN);
  });

  it('ignores a request whose response is already over', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    void outcomeOf(runCancelableHandler(() => pending(), req, res));
    res.end();

    expect(getLiveRequests(server)?.size).toBe(0);
    expect(await shutdownServer(server)).toEqual({ canceled: 0, completed: 0, timedOut: false });
  });

  it('counts a tracked request whose response closed before shutdown and has nothing in flight', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    ensureRequestCancelState(req, res);
    // flagged closed before its close event dispatches, so the registry still holds it at admission
    Object.assign(res, { closed: true });

    await expect(shutdownServer(server, { timeout: 50 })).resolves.toEqual({
      canceled: 0,
      completed: 1,
      timedOut: false,
    });
  });

  it('finishes the shutdown when a strict, shielded task rejects its own cancel', async () => {
    const server = new FakeServer();
    const { req, res } = createExchange(server);

    ensureRequestCancelState(req, res).live.add(pending({ shield: true, strict: true }));

    await expect(shutdownServer(server, { timeout: 50 })).resolves.toEqual(expect.objectContaining({ timedOut: true }));
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

      const first = shutdownServer(server, { timeout: 50 });
      first.cancel();

      const second = shutdownServer(server, { timeout: 100 });
      expect(second).not.toBe(first);
      // race loser window timer clears a few jobs after the cancel
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
      // the second shutdown's grace timer and idle sweep, nothing left over from the first
      expect(jest.getTimerCount()).toBe(2);

      jest.advanceTimersByTime(50);
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
      expect(shutdownServer(server)).toBe(second);

      jest.advanceTimersByTime(50);
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
      void shutdownServer(server, { timeout }).then((value) => {
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
    const { port, server } = await listen((_req, res) => {
      setTimeout(() => res.end('plain ok'), 200);
    });
    const answer = get(port, '/plain');
    await sleep(50);
    const result = await shutdownServer(server, { timeout: 1000 });

    expect(await answer).toMatchObject({ body: 'plain ok', status: 200 });
    expect(result.timedOut).toBe(false);
  });

  it('resets a request still running when the grace window closes', async () => {
    const { port, server } = await listen((_req, res) => {
      setTimeout(() => res.end('too late'), 2000).unref();
    });

    const answer = get(port, '/slow');
    await sleep(50);
    const startedAt = Date.now();
    const result = await shutdownServer(server, { timeout: 1000 });
    const outcome = await answer;

    expect(outcome.error).toBe('ECONNRESET');
    expect(outcome.at - startedAt).toBeGreaterThanOrEqual(900);
    expect(result.timedOut).toBe(true);
  });

  it('answers a request arriving on a kept-alive connection with Connection close', async () => {
    let lateSignalAborted: boolean | undefined;
    const { port, server } = await listen((req, res) => {
      if (req.url === '/first') {
        res.writeHead(200, { 'Content-Length': '5' });
        res.write('fir');
        setTimeout(() => res.end('st'), 200);

        return;
      }

      lateSignalAborted = getNodeRequestSignal(req, res).aborted;
      res.end('late');
    });

    const client = connect(port, '127.0.0.1');
    sockets.push(client);
    client.on('error', () => {});
    await once(client, 'connect');
    let received = '';
    client.on('data', (chunk: Buffer) => {
      received += chunk.toString('latin1');
    });
    const closed = once(client, 'close');

    client.write('GET /first HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await sleep(50);
    const shutdown = shutdownServer(server, { timeout: 1000 });
    await sleep(10);
    client.write('GET /late HTTP/1.1\r\nHost: localhost\r\n\r\n');

    const result = await shutdown;
    await closed;
    const responses = received.split(/(?=HTTP\/1\.1 )/);

    expect(responses).toHaveLength(2);
    expect(responses[0]).toMatch(/^HTTP\/1\.1 200[\s\S]*first$/);
    expect(responses[1]).toMatch(/^HTTP\/1\.1 200/);
    expect(responses[1]).toMatch(/\r\nConnection: close\r\n/i);
    expect(responses[1]).toMatch(/late$/);
    expect(lateSignalAborted).toBe(true);
    expect(result.timedOut).toBe(false);
  });

  it('counts one request once however many wrapped layers it went through', async () => {
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
    });

    const answer = get(port, '/stack');
    await sleep(50);
    const result = await shutdownServer(server, { timeout: 1000 });

    expect(await answer).toMatchObject({ status: 503 });
    expect(result).toEqual({ canceled: 1, completed: 0, timedOut: false });
  });

  it('counts a request whose response finished during the drain as completed', async () => {
    const { port, server } = await listen((req, res) => {
      void runCancelableHandler(() => 'next', req, res);
      setTimeout(() => res.end('done'), 200);
    });

    const answer = get(port, '/finish');
    await sleep(50);
    const result = await shutdownServer(server, { timeout: 1000 });

    expect(await answer).toMatchObject({ body: 'done', status: 200 });
    expect(result).toEqual({ canceled: 0, completed: 1, timedOut: false });
  });

  it('does not track a signal asked for after the response closed', async () => {
    const lateSignals: boolean[] = [];
    const { port, server } = await listen((req, res) => {
      res.end('ok');
      res.on('close', () => {
        setImmediate(() => {
          lateSignals.push(getNodeRequestSignal(req, res).aborted);
          void runCancelableHandler(() => 'late', req, res, { timeout: 60_000 });
        });
      });
    });
    for (const path of ['/a', '/b', '/c']) {
      await get(port, path);
    }
    await sleep(20);

    expect(lateSignals).toEqual([false, false, false]);
    expect(getLiveRequests(server)?.size ?? 0).toBe(0);
    expect(await shutdownServer(server, { timeout: 1000 })).toEqual({ canceled: 0, completed: 0, timedOut: false });
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
});

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
        resolve({ at: Date.now(), body, connection: res.headers.connection, status: res.statusCode });
      });
      res.on('error', (error: NodeJS.ErrnoException) => resolve({ at: Date.now(), error: error.code }));
    });
    req.on('error', (error: NodeJS.ErrnoException) => resolve({ at: Date.now(), error: error.code }));
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
