import { createServer, request as sendRequest, Server } from 'node:http';

import Fastify, { FastifyInstance } from 'fastify';

import * as expressServer from './canc-server-express/src';
import * as fastifyServer from './canc-server-fastify/src';
import * as honoServer from './canc-server-hono/src';
import * as koaServer from './canc-server-koa/src';
import * as nodeServer from './canc-server-node/src';

const servers: Server[] = [];
const apps: FastifyInstance[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close();
  }

  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

function requestStatus(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = sendRequest({ host: '127.0.0.1', path: '/hang', port }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode ?? 0));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

describe('shutdown options are checked where they are written', () => {
  it.each(['express', 'koa', 'node', 'hono'] as const)(
    '%s throws a reversed pair from the shutdown call, before closing',
    async (name) => {
      const server = createServer();
      servers.push(server);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const adapters = { express: expressServer, koa: koaServer, node: nodeServer, hono: honoServer };
      const shutdown = adapters[name].createShutdown(server);

      expect(() => shutdown({ cancelAfter: 5_000, closeAfter: 4_000 })).toThrow(RangeError);
      expect(server.listening).toBe(true);
    },
  );

  it('fastify throws a reversed pair from createShutdown', () => {
    const app = Fastify();
    apps.push(app);

    expect(() => fastifyServer.createShutdown(app, { cancelAfter: 5_000, closeAfter: 4_000 })).toThrow(/5000.*4000/);
    expect(() => fastifyServer.createShutdown(app, { status: 700 })).toThrow(RangeError);
    expect(() => fastifyServer.createShutdown(app, { headers: { 'bad name': 'x' } })).toThrow(TypeError);
  });

  it('fastify keeps the stored options after a rejected set', async () => {
    const app = Fastify();
    apps.push(app);
    await app.register(fastifyServer.cancelPlugin);
    fastifyServer.createShutdown(app, { cancelAfter: 100 });
    expect(() => fastifyServer.createShutdown(app, { cancelAfter: 5_000, closeAfter: 4_000 })).toThrow(RangeError);

    const started = deferred();
    app.get(
      '/hang',
      fastifyServer.cancelableHandler(function* () {
        started.resolve();
        yield new Promise(() => undefined);
      }),
    );
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a bound tcp address');
    }

    const pending = requestStatus(address.port);
    await started.promise;

    let timer!: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        app.close(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('fastify close took more than 2000 ms')), 2_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }

    expect(await pending).toBe(503);
  });
});
