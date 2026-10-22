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
 * Starts an app whose one route, `GET /slow`, calls `arrived` once the request reaches it and
 * answers `ok` after `release` resolves.
 */
export type TStartPlainApp = (arrived: () => void, release: Promise<void>) => Promise<IPlainApp>;

type TCreateShutdown = (target: never) => (options?: IShutdownOptions) => Promise<IShutdownResult>;

/** Long enough that a drain finishing well inside it is plainly not a grace window running out. */
const GRACE_MS = 2000;
/** Short window for the late cases, which wait it out in full. */
const LATE_GRACE_MS = 300;
/** Slack for timer and clock granularity when a wait must last the whole window. */
const TIMER_SLACK_MS = 20;

/**
 * Real-socket cases for `createShutdown` on an app that never registered any cancel middleware, so
 * the shutdown knows only what the factory recorded.
 */
export function describeShutdownSockets(createShutdown: TCreateShutdown, start: TStartPlainApp): void {
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
    let arrived!: () => void;
    let release!: () => void;
    const arrival = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    releaseAll.push(release);

    const app = await start(arrived, released);
    servers.push(app.server);

    return { ...app, arrival, port: (app.server.address() as AddressInfo).port, release };
  };

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

      const startedAt = performance.now();
      const closing = shutdown({ timeout: GRACE_MS });
      app.release();
      const result = await closing;
      const elapsed = performance.now() - startedAt;

      expect(await answer).toBe('close');
      expect(result).toEqual({ canceled: 0, completed: 1, timedOut: false });
      expect(elapsed).toBeLessThan(GRACE_MS / 2);
      expect(app.server.listening).toBe(false);
    });

    it('closes a connection that sent no request as soon as it starts', async () => {
      const app = await startApp();
      const shutdown = createShutdown(app.target as never);
      const { closed } = await preconnect(app.server, app.port);

      const startedAt = performance.now();
      const result = await shutdown({ timeout: GRACE_MS });
      const elapsed = performance.now() - startedAt;
      const closedAfter = (await closed) - startedAt;

      expect(result).toEqual({ canceled: 0, completed: 0, timedOut: false });
      expect(elapsed).toBeLessThan(GRACE_MS / 2);
      expect(closedAfter).toBeLessThan(GRACE_MS / 2);
    });

    it('returns the same function for the same target', async () => {
      const app = await startApp();

      expect(createShutdown(app.target as never)).toBe(createShutdown(app.target as never));
    });

    it('returns the same promise to a second call while the first runs', async () => {
      const app = await startApp();
      const shutdown = createShutdown(app.target as never);
      const first = shutdown({ timeout: GRACE_MS });

      expect(shutdown()).toBe(first);
      expect(await first).toEqual({ canceled: 0, completed: 0, timedOut: false });
    });

    it('created after a connection opened, closes that connection only when the window ends', async () => {
      const app = await startApp();
      const { closed } = await preconnect(app.server, app.port);
      const shutdown = createShutdown(app.target as never);

      const startedAt = performance.now();
      const result = await shutdown({ timeout: LATE_GRACE_MS });
      const elapsed = performance.now() - startedAt;
      const closedAfter = (await closed) - startedAt;

      expect(result.timedOut).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(LATE_GRACE_MS - TIMER_SLACK_MS);
      expect(closedAfter).toBeGreaterThanOrEqual(LATE_GRACE_MS - TIMER_SLACK_MS);
    });

    it('created after a request arrived, sends its response without Connection: close', async () => {
      const app = await startApp();
      const answer = keptAliveRequest(app.port);
      await app.arrival;
      const shutdown = createShutdown(app.target as never);

      const startedAt = performance.now();
      const closing = shutdown({ timeout: LATE_GRACE_MS });
      app.release();
      const connection = await answer;
      await closing;
      const elapsed = performance.now() - startedAt;

      expect(connection).toBe('keep-alive');
      expect(elapsed).toBeGreaterThanOrEqual(LATE_GRACE_MS - TIMER_SLACK_MS);
    });
  });
}
