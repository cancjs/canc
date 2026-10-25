import { CancelSignal } from '@cancjs/promise';
import { once } from 'events';
import { ClientRequest, createServer, IncomingMessage, request as httpRequest, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

import { getNodeRequestSignal } from './node-signal';
import { CLIENT_DISCONNECTED } from './reasons';
import { IRequestLike, IResponseLike } from './types';

// pins node core today, a failure of either case means upstream changed

// node 18 has no IncomingMessage.prototype.signal, so there is nothing to pin there
const describePlatform = 'signal' in IncomingMessage.prototype ? describe : describe.skip;

// node 24.20 stopped aborting the platform signal at body end, so expectations branch by version
const abortsAtBodyEnd = hasBodyEndAbort();

function hasBodyEndAbort(): boolean {
  const [major, minor] = process.versions.node.split('.').map(Number);

  return major < 24 || (major === 24 && minor < 20);
}

interface IExchange {
  bodyEnded: Promise<unknown>;
  cancSignal: CancelSignal;
  platformAborted: Promise<void>;
  platformSignal: AbortSignal;
  req: IncomingMessage;
  res: ServerResponse;
}

describePlatform('node platform request signal', () => {
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
      const bodyEnded = once(req, 'end');

      // draining the body is what lets the request stream complete and close
      req.resume();
      arrived({ bodyEnded, cancSignal, platformAborted, platformSignal, req, res });
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

  it('platform signal after body end with client still connected', async () => {
    const { client, exchange } = postWithBody();
    const { bodyEnded, platformAborted, platformSignal, req, res } = await exchange;

    // before 24.20 the abort marks the body end; after it, the body end event is the only signal
    await (abortsAtBodyEnd ? platformAborted : bodyEnded);

    expect(platformSignal.aborted).toBe(abortsAtBodyEnd);
    // a fully consumed request stream auto-destroys on every version, the socket is what stays up
    expect(req.destroyed).toBe(true);
    expect(client.socket?.destroyed).toBe(false);
    expect(req.socket.destroyed).toBe(false);
    expect(res.destroyed).toBe(false);
    expect(res.writableEnded).toBe(false);

    res.end('ok');
  });

  it('canc disconnect signal stays live', async () => {
    const { client, exchange } = postWithBody();
    const { bodyEnded, cancSignal, platformAborted, platformSignal, res } = await exchange;

    await (abortsAtBodyEnd ? platformAborted : bodyEnded);

    expect(platformSignal.aborted).toBe(abortsAtBodyEnd);
    expect(cancSignal.aborted).toBe(false);

    const gone = once(res, 'close');

    client.destroy();
    await gone;

    expect(cancSignal.aborted).toBe(true);
    expect(cancSignal.reason.message).toBe(CLIENT_DISCONNECTED);
  });
});
