import { CancelSignal } from '@cancjs/promise';
import { once } from 'events';
import { ClientRequest, createServer, IncomingMessage, request as httpRequest, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

import { getNodeRequestSignal } from '../node-signal';
import { CLIENT_DISCONNECTED } from '../reasons';
import { IRequestLike, IResponseLike } from '../types';

// pins node core today, a failure of the first case means upstream changed

interface IExchange {
  cancSignal: CancelSignal;
  platformAborted: Promise<void>;
  platformSignal: AbortSignal;
  req: IncomingMessage;
  res: ServerResponse;
}

describe('node platform request signal', () => {
  let server: Server;
  let port: number;
  let arrived: (exchange: IExchange) => void;
  const clients: ClientRequest[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      const platformSignal = (req as IncomingMessage & { signal: AbortSignal }).signal;
      const cancSignal = getNodeRequestSignal(req as unknown as IRequestLike, res as unknown as IResponseLike);
      const platformAborted = new Promise<void>((resolve) => {
        platformSignal.addEventListener('abort', () => resolve(), { once: true });
      });

      // draining the body is what lets the request stream complete and close
      req.resume();
      arrived({ cancSignal, platformAborted, platformSignal, req, res });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    clients.forEach((client) => client.destroy());
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function postWithBody(): { client: ClientRequest; exchange: Promise<IExchange> } {
    const exchange = new Promise<IExchange>((resolve) => {
      arrived = resolve;
    });
    const client = httpRequest({ headers: { connection: 'close' }, host: '127.0.0.1', method: 'POST', port });

    clients.push(client);
    client.on('error', () => undefined);
    client.end('body');

    return { client, exchange };
  }

  it('platform signal aborts after body end with client still connected', async () => {
    const { client, exchange } = postWithBody();
    const { platformAborted, platformSignal, req, res } = await exchange;

    await platformAborted;

    expect(platformSignal.aborted).toBe(true);
    expect(req.destroyed).toBe(true);
    expect(client.socket?.destroyed).toBe(false);
    expect(req.socket.destroyed).toBe(false);
    expect(res.destroyed).toBe(false);
    expect(res.writableEnded).toBe(false);

    res.end('ok');
  });

  it('canc disconnect signal stays live', async () => {
    const { client, exchange } = postWithBody();
    const { cancSignal, platformAborted, platformSignal, res } = await exchange;

    await platformAborted;

    expect(platformSignal.aborted).toBe(true);
    expect(cancSignal.aborted).toBe(false);

    const gone = once(res, 'close');

    client.destroy();
    await gone;

    expect(cancSignal.aborted).toBe(true);
    expect(cancSignal.reason.message).toBe(CLIENT_DISCONNECTED);
  });
});
