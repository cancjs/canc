import { once } from 'events';
import { Server } from 'http';
import { AddressInfo, connect, Socket } from 'net';
import { performance } from 'perf_hooks';

import { IShutdownOptions, IShutdownResult } from '../types';

/** An app with no cancel middleware, plugin or wrapped route, only a shutdown. */
export interface IPlainApp {
  /** What `createShutdown` takes: the server, or the fastify instance. */
  target: unknown;
  server: Server;
}

/**
 * Starts an app whose route `GET /slow` calls `arrived` once the request reaches it and answers
 * `ok` after `release` resolves, and whose `GET /fast` answers `ok` at once.
 *
 * With `appSetHeaders`, two more routes behave as `/slow` but first set `Connection: close` on the
 * response: `GET /close` keeps the head unsent, `GET /flush` sends it at once.
 */
export type TStartPlainApp = (arrived: () => void, release: Promise<void>) => Promise<IPlainApp>;

/** What the app under test supports beyond the plain routes. */
export interface IShutdownSocketsOptions {
  /** The app serves `/close` and `/flush`, its headers landing on the node response as they are set. */
  appSetHeaders?: boolean;
}

type TCreateShutdown = (target: never) => (options?: IShutdownOptions) => Promise<IShutdownResult>;

/** Long enough that a drain finishing well inside it is plainly not a grace window running out. */
const GRACE_MS = 10_000;
/** Short window for the late cases, which wait it out in full. */
const LATE_GRACE_MS = 300;
/** How old a connection that sent nothing must be before a shutdown closes it; mirrors the shutdown's age. */
const REQUESTLESS_AGE_MS = 5_000;
/** Slack for timer and clock granularity when a wait must last the whole window. */
const TIMER_SLACK_MS = 20;

/**
 * Real-socket cases for `createShutdown` on an app that never registered any cancel middleware, so
 * the shutdown knows only what the factory recorded.
 */
export function describeShutdownSockets(
  createShutdown: TCreateShutdown,
  start: TStartPlainApp,
  options: IShutdownSocketsOptions = {},
): void {
  const clients: Socket[] = [];
  const servers: Server[] = [];
  let releaseAll: (() => void)[] = [];

  afterEach(async () => {
    for (const release of releaseAll) {
      release();
    }

    releaseAll = [];

    for (const client of clients.splice(0)) {
      client.destroy();
    }

    for (const server of servers.splice(0)) {
      if (server.listening) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  });

  const startApp = async () => {
    let arrivals = 0;
    const waiting: { count: number; resolve: () => void }[] = [];
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    releaseAll.push(release);

    const arrivedTimes = (count: number) =>
      new Promise<void>((resolve) => {
        if (arrivals >= count) {
          resolve();
        } else {
          waiting.push({ count, resolve });
        }
      });

    const app = await start(() => {
      arrivals += 1;
      for (const waiter of waiting) {
        if (arrivals >= waiter.count) {
          waiter.resolve();
        }
      }
    }, released);
    servers.push(app.server);

    return {
      ...app,
      arrival: arrivedTimes(1),
      arrivedTimes,
      port: (app.server.address() as AddressInfo).port,
      release,
    };
  };

  const openClient = (port: number) => {
    const client = connect(port, '127.0.0.1');
    clients.push(client);
    client.setEncoding('utf8');

    let received = '';
    let error: string | undefined;
    client.on('data', (chunk: string) => {
      received += chunk;
    });
    client.on('error', (e: NodeJS.ErrnoException) => {
      error = e.code;
    });
    // every answer sent before the server closed the connection, so a dropped one shows as missing
    const closed = new Promise<{ error?: string; statuses: string[] }>((resolve) => {
      client.once('close', () => resolve({ error, statuses: received.match(/HTTP\/1\.1 \d{3}/g) ?? [] }));
    });

    return { client, closed, received: () => received };
  };

  const until = async (condition: () => boolean) => {
    while (!condition()) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  };

  const REQUEST_HEAD = 'GET /slow HTTP/1.1\r\nHost: localhost\r\n';

  // HTTP/1.1 keeps the connection alive by default, so only the shutdown can be what closes it;
  // resolves with the Connection header of the answer
  const keptAliveRequest = (port: number) => {
    const client = connect(port, '127.0.0.1');
    clients.push(client);
    client.write('GET /slow HTTP/1.1\r\nHost: localhost\r\n\r\n');

    return new Promise<string | undefined>((resolve, reject) => {
      let received = '';
      client.setEncoding('utf8');
      client.on('data', (chunk: string) => {
        received += chunk;
        const headEnd = received.indexOf('\r\n\r\n');
        if (headEnd !== -1 && received.endsWith('ok')) {
          resolve(/^connection:\s*(\S+)/im.exec(received.slice(0, headEnd))?.[1]);
        }
      });
      client.on('error', reject);
    });
  };

  // a connection that sends nothing, the shape of a browser or proxy preconnect
  const preconnect = async (server: Server, port: number) => {
    const accepted = once(server, 'connection');
    const client = connect(port, '127.0.0.1');
    clients.push(client);
    client.on('error', () => undefined);
    const closed = once(client, 'close').then(() => performance.now());

    await once(client, 'connect');
    await accepted;

    // wrapped, or the async return would wait for the close itself
    return { closed };
  };

  describe('createShutdown on an app with no cancel middleware', () => {
    it('sends an in-flight response with Connection: close and drains well under the grace window', async () => {
      const app = await startApp();
      const shutdown = createShutdown(app.target as never);
      const answer = keptAliveRequest(app.port);
      await app.arrival;

      const closing = shutdown({ cancelAfter: GRACE_MS });
      app.release();
      const result = await closing;

      expect(await answer).toBe('close');
      expect(result).toEqual({ canceled: 0, completed: 1, timedOut: false });
      expect(app.server.listening).toBe(false);
    });

    it('answers a request the server read before the shutdown started', async () => {
      const app = await startApp();
      app.release();
      const shutdown = createShutdown(app.target as never);
      let closing: Promise<IShutdownResult> | undefined;
      // runs ahead of the shutdown's own request listener: read, not yet recorded
      app.server.prependListener('request', () => {
        closing ??= shutdown({ cancelAfter: GRACE_MS });
      });

      const { client, closed } = openClient(app.port);
      client.write(`${REQUEST_HEAD}\r\n`);

      expect(await closed).toEqual({ error: undefined, statuses: ['HTTP/1.1 200'] });
      expect(await closing).toEqual({ canceled: 0, completed: 1, timedOut: false });
    });

    it('answers a request whose head was partly read when the shutdown started', async () => {
      const app = await startApp();
      app.release();
      const shutdown = createShutdown(app.target as never);
      const accepted = once(app.server, 'connection');
      const { client, closed } = openClient(app.port);
      const [socket] = (await accepted) as [Socket];

      client.write(REQUEST_HEAD);
      await until(() => socket.bytesRead > 0);
      const closing = shutdown({ cancelAfter: GRACE_MS });
      client.write('\r\n');

      expect(await closed).toEqual({ error: undefined, statuses: ['HTTP/1.1 200'] });
      expect(await closing).toEqual({ canceled: 0, completed: 1, timedOut: false });
    });

    it('answers a second request half sent on a kept-alive connection', async () => {
      const app = await startApp();
      app.release();
      const shutdown = createShutdown(app.target as never);
      const accepted = once(app.server, 'connection');
      const { client, closed, received } = openClient(app.port);
      const [socket] = (await accepted) as [Socket];

      client.write(`${REQUEST_HEAD}\r\n`);
      await until(() => received().endsWith('ok'));
      const firstRead = socket.bytesRead;
      client.write(REQUEST_HEAD);
      await until(() => socket.bytesRead > firstRead);
      const closing = shutdown({ cancelAfter: GRACE_MS });
      client.write('\r\n');

      expect(await closed).toEqual({ error: undefined, statuses: ['HTTP/1.1 200', 'HTTP/1.1 200'] });
      expect(await closing).toEqual({ canceled: 0, completed: 1, timedOut: false });
    });

    it('answers both pipelined requests when neither response had started', async () => {
      const app = await startApp();
      const shutdown = createShutdown(app.target as never);
      const { client, closed } = openClient(app.port);
      client.write(`${REQUEST_HEAD}\r\n${REQUEST_HEAD}\r\n`);
      await app.arrivedTimes(2);

      const closing = shutdown({ cancelAfter: GRACE_MS });
      app.release();

      expect(await closed).toEqual({ error: undefined, statuses: ['HTTP/1.1 200', 'HTTP/1.1 200'] });
      expect(await closing).toEqual({ canceled: 0, completed: 2, timedOut: false });
    });

    it('answers a pipelined request already ended while the first one is held', async () => {
      const app = await startApp();
      const shutdown = createShutdown(app.target as never);
      const { client, closed } = openClient(app.port);
      client.write(`${REQUEST_HEAD}\r\nGET /fast HTTP/1.1\r\nHost: localhost\r\n\r\n`);
      await app.arrivedTimes(1);

      const closing = shutdown({ cancelAfter: GRACE_MS });
      app.release();

      expect(await closed).toEqual({ error: undefined, statuses: ['HTTP/1.1 200', 'HTTP/1.1 200'] });
      expect(await closing).toEqual({ canceled: 0, completed: 2, timedOut: false });
    });

    it('returns the same function for the same target', async () => {
      const app = await startApp();

      expect(createShutdown(app.target as never)).toBe(createShutdown(app.target as never));
    });

    it('returns the same promise to a second call while the first runs', async () => {
      const app = await startApp();
      const shutdown = createShutdown(app.target as never);
      const first = shutdown({ cancelAfter: GRACE_MS });

      expect(shutdown()).toBe(first);
      expect(await first).toEqual({ canceled: 0, completed: 0, timedOut: false });
    });

    it('created after a connection opened, closes that connection at closeAfter', async () => {
      const app = await startApp();
      const { closed } = await preconnect(app.server, app.port);
      const shutdown = createShutdown(app.target as never);

      const startedAt = performance.now();
      const result = await shutdown({ cancelAfter: LATE_GRACE_MS, closeAfter: 2 * LATE_GRACE_MS });
      const elapsed = performance.now() - startedAt;
      const closedAfter = (await closed) - startedAt;

      // a connection canc cannot see is open until closeAfter, so the window times out
      expect(result.timedOut).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(2 * LATE_GRACE_MS - TIMER_SLACK_MS);
      expect(closedAfter).toBeGreaterThanOrEqual(2 * LATE_GRACE_MS - TIMER_SLACK_MS);
    });

    it('serves an in-flight request with no cancel middleware to completion, shutdown resolves after it', async () => {
      const app = await startApp();
      // created before the request so it is tracked; a late request has its own spec
      const shutdown = createShutdown(app.target as never);
      const { client, closed } = openClient(app.port);
      client.write(`${REQUEST_HEAD}\r\n`);
      await app.arrival;
      const order: string[] = [];
      const closing = shutdown({ cancelAfter: LATE_GRACE_MS, closeAfter: GRACE_MS });
      closing.then(() => order.push('resolved'));

      // the cancel point passes while the request is still held by the app
      await new Promise((resolve) => setTimeout(resolve, LATE_GRACE_MS + TIMER_SLACK_MS));
      order.push('released');
      app.release();
      const answer = await closed;

      expect(answer.statuses).toEqual(['HTTP/1.1 200']);
      expect(await closing).toEqual({ canceled: 0, completed: 1, timedOut: false });
      expect(order).toEqual(['released', 'resolved']);
    });

    it('cuts a plain request still running at closeAfter, shutdown resolves timedOut', async () => {
      const app = await startApp();
      const { client, closed } = openClient(app.port);
      client.write(`${REQUEST_HEAD}\r\n`);
      await app.arrival;
      const shutdown = createShutdown(app.target as never);

      const startedAt = performance.now();
      const result = await shutdown({ cancelAfter: LATE_GRACE_MS, closeAfter: 2 * LATE_GRACE_MS });
      const elapsed = performance.now() - startedAt;
      const answer = await closed;

      expect(answer.statuses).toEqual([]);
      expect(result).toEqual({ canceled: 0, completed: 0, timedOut: true });
      expect(elapsed).toBeGreaterThanOrEqual(2 * LATE_GRACE_MS - TIMER_SLACK_MS);
    });

    it('created after a request arrived, sends its response without Connection: close', async () => {
      const app = await startApp();
      const answer = keptAliveRequest(app.port);
      await app.arrival;
      const shutdown = createShutdown(app.target as never);

      const startedAt = performance.now();
      const closing = shutdown({ cancelAfter: LATE_GRACE_MS });
      app.release();
      const connection = await answer;
      await closing;
      const elapsed = performance.now() - startedAt;

      expect(connection).toBe('keep-alive');
      expect(elapsed).toBeGreaterThanOrEqual(LATE_GRACE_MS - TIMER_SLACK_MS);
    });
  });

  if (options.appSetHeaders) {
    describe('a Connection: close the app set', () => {
      const FAST_HEAD = 'GET /fast HTTP/1.1\r\nHost: localhost\r\n\r\n';

      // resolves once the server has emitted this many requests
      const requestsSeen = (server: Server, count: number) => {
        let seen = 0;
        server.on('request', () => {
          seen += 1;
        });

        return until(() => seen >= count);
      };

      const connectionHeaders = (received: string) => received.match(/^connection:\s*\S+/gim) ?? [];

      it('is kept when set before the shutdown started, with a pipelined request queued', async () => {
        const app = await startApp();
        const shutdown = createShutdown(app.target as never);
        const seen = requestsSeen(app.server, 2);
        const { client, closed, received } = openClient(app.port);
        client.write(`GET /close HTTP/1.1\r\nHost: localhost\r\n\r\n${FAST_HEAD}`);
        await seen;

        const closing = shutdown({ cancelAfter: GRACE_MS });
        app.release();

        expect(await closed).toEqual({ error: undefined, statuses: ['HTTP/1.1 200'] });
        expect(connectionHeaders(received())).toEqual(['Connection: close']);
        expect(await closing).toEqual({ canceled: 1, completed: 1, timedOut: false });
      });

      it('is kept when set before the shutdown started, with a request pipelined after it', async () => {
        const app = await startApp();
        const shutdown = createShutdown(app.target as never);
        const seen = requestsSeen(app.server, 2);
        const { client, closed, received } = openClient(app.port);
        client.write('GET /close HTTP/1.1\r\nHost: localhost\r\n\r\n');
        await app.arrival;

        const closing = shutdown({ cancelAfter: GRACE_MS });
        client.write(FAST_HEAD);
        await seen;
        app.release();

        expect(await closed).toEqual({ error: undefined, statuses: ['HTTP/1.1 200'] });
        expect(connectionHeaders(received())).toEqual(['Connection: close']);
        expect(await closing).toEqual({ canceled: 1, completed: 1, timedOut: false });
      });

      it('once sent, leaves a pipelined response that never went out uncounted as completed', async () => {
        const app = await startApp();
        const shutdown = createShutdown(app.target as never);
        const seen = requestsSeen(app.server, 2);
        const { client, closed, received } = openClient(app.port);
        client.write(`GET /flush HTTP/1.1\r\nHost: localhost\r\n\r\n${FAST_HEAD}`);
        await seen;

        const closing = shutdown({ cancelAfter: GRACE_MS });
        app.release();

        expect(await closed).toEqual({ error: undefined, statuses: ['HTTP/1.1 200'] });
        expect(connectionHeaders(received())).toEqual(['Connection: close']);
        expect(await closing).toEqual({ canceled: 1, completed: 1, timedOut: false });
      });
    });
  }

  // the clock is faked so the age runs on jest's timers; I/O and nextTick stay real
  describe('a connection that sent no bytes, by age', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    // faked only once listening, a framework may wait on a timer to start
    const startAged = async () => {
      const app = await startApp();
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      return app;
    };

    // one turn of the event loop, so a socket closed or read just before has emitted
    const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
    // a close the socket would make on its own has long emitted by then
    const settle = async () => {
      for (let turns = 0; turns < 10; turns += 1) {
        await turn();
      }
    };

    it('closes a connection that sent nothing once it is older than the age', async () => {
      const app = await startAged();
      const shutdown = createShutdown(app.target as never);
      const { closed } = await preconnect(app.server, app.port);
      jest.advanceTimersByTime(REQUESTLESS_AGE_MS);

      expect(await shutdown({ cancelAfter: GRACE_MS })).toEqual({ canceled: 0, completed: 0, timedOut: false });
      await closed;
    });

    it('closes a younger connection when it reaches the age, not at start', async () => {
      const app = await startAged();
      const shutdown = createShutdown(app.target as never);
      const { closed } = await preconnect(app.server, app.port);
      let isClosed = false;
      void closed.then(() => {
        isClosed = true;
      });

      const closing = shutdown({ cancelAfter: GRACE_MS });
      await settle();
      expect(isClosed).toBe(false);

      jest.advanceTimersByTime(REQUESTLESS_AGE_MS - 1);
      await settle();
      expect(isClosed).toBe(false);

      jest.advanceTimersByTime(1);
      expect(await closing).toEqual({ canceled: 0, completed: 0, timedOut: false });
      await closed;
      expect(isClosed).toBe(true);
    });

    it('serves a request that arrives before the age runs out', async () => {
      const app = await startAged();
      app.release();
      const shutdown = createShutdown(app.target as never);
      const accepted = once(app.server, 'connection');
      const { client, closed } = openClient(app.port);
      const [socket] = (await accepted) as [Socket];
      const closing = shutdown({ cancelAfter: GRACE_MS });

      client.write(`${REQUEST_HEAD}\r\n`);
      for (let turns = 0; socket.bytesRead === 0 && turns < 100; turns += 1) {
        await turn();
      }
      jest.advanceTimersByTime(REQUESTLESS_AGE_MS);

      expect(await closed).toEqual({ error: undefined, statuses: ['HTTP/1.1 200'] });
      expect(await closing).toEqual({ canceled: 0, completed: 1, timedOut: false });
    });

    it('leaves no timer behind for a younger connection that closes first', async () => {
      const app = await startAged();
      const shutdown = createShutdown(app.target as never);
      const accepted = once(app.server, 'connection');
      const client = connect(app.port, '127.0.0.1');
      clients.push(client);
      client.on('error', () => undefined);
      const [socket] = (await accepted) as [Socket];
      const serverClosed = once(socket, 'close');

      const closing = shutdown({ cancelAfter: GRACE_MS });
      await settle();
      client.destroy();
      await serverClosed;

      expect(await closing).toEqual({ canceled: 0, completed: 0, timedOut: false });
      // a framework may still hold a zero-delay timer of its own
      jest.advanceTimersByTime(0);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('caps the age at the grace window when the window is shorter', async () => {
      const app = await startAged();
      const shutdown = createShutdown(app.target as never);
      const { closed } = await preconnect(app.server, app.port);
      let isClosed = false;
      void closed.then(() => {
        isClosed = true;
      });

      const closing = shutdown({ cancelAfter: LATE_GRACE_MS });
      jest.advanceTimersByTime(LATE_GRACE_MS - 1);
      await turn();
      expect(isClosed).toBe(false);

      jest.advanceTimersByTime(1);
      await closing;
      await closed;
      expect(isClosed).toBe(true);
    });
  });
}
