import Fastify, { FastifyInstance } from 'fastify';
import { ClientRequest, request as httpRequest } from 'http';
import { AddressInfo } from 'net';

import { CLIENT_DISCONNECTED } from '../../../_server/reasons';
import { getRequestSignal } from './handler';

// pins fastify 5 today, a failure of the first case means upstream changed

interface IExchange {
  cancAborted: () => boolean;
  cancReason: () => unknown;
  platformAborted: Promise<void>;
  platformSignal: AbortSignal;
  release: () => void;
  replyClosed: Promise<void>;
  replyEnded: () => boolean;
  socketDestroyed: () => boolean;
}

describe('fastify platform request signal', () => {
  let app: FastifyInstance;
  let port: number;
  let arrived: (exchange: IExchange) => void;
  const clients: ClientRequest[] = [];

  beforeAll(async () => {
    app = Fastify();
    app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_request, body, done) => done(null, body));
    app.post('/', async (request, reply) => {
      const platformSignal = request.signal;
      const cancSignal = getRequestSignal(request, reply);
      const platformAborted = new Promise<void>((resolve) => {
        platformSignal.addEventListener('abort', () => resolve(), { once: true });
      });
      const replyClosed = new Promise<void>((resolve) => {
        reply.raw.once('close', () => resolve());
      });
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });

      arrived({
        cancAborted: () => cancSignal.aborted,
        cancReason: () => cancSignal.reason,
        platformAborted,
        platformSignal,
        release,
        replyClosed,
        replyEnded: () => reply.raw.writableEnded,
        socketDestroyed: () => request.raw.socket.destroyed,
      });

      await released;

      return 'ok';
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = (app.server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    clients.forEach((client) => client.destroy());
    app.server.closeAllConnections();
    await app.close();
  });

  function postWithBody(): { client: ClientRequest; exchange: Promise<IExchange> } {
    const exchange = new Promise<IExchange>((resolve) => {
      arrived = resolve;
    });
    const client = httpRequest({
      headers: { connection: 'close', 'content-type': 'text/plain' },
      host: '127.0.0.1',
      method: 'POST',
      path: '/',
      port,
    });

    clients.push(client);
    client.on('error', () => undefined);
    client.end('body');

    return { client, exchange };
  }

  it('platform signal aborts after body end with client still connected', async () => {
    const { client, exchange } = postWithBody();
    const hold = await exchange;

    await hold.platformAborted;

    expect(hold.platformSignal.aborted).toBe(true);
    expect(client.socket?.destroyed).toBe(false);
    expect(hold.socketDestroyed()).toBe(false);
    expect(hold.replyEnded()).toBe(false);

    hold.release();
  });

  it('canc disconnect signal stays live', async () => {
    const { client, exchange } = postWithBody();
    const hold = await exchange;

    await hold.platformAborted;

    expect(hold.platformSignal.aborted).toBe(true);
    expect(hold.cancAborted()).toBe(false);

    client.destroy();
    await hold.replyClosed;

    expect(hold.cancAborted()).toBe(true);
    expect((hold.cancReason() as Error).message).toBe(CLIENT_DISCONNECTED);

    hold.release();
  });
});
