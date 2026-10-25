import { EventEmitter } from 'events';

import { FakeResponse } from './__tests__/fakes';
import { getRequestRegistry, getRequestServer, IRequestCancelState, trackConnections, trackRequest } from './holder';
import { IRequestLike, IServerLike } from './types';

describe('request holder', () => {
  it('drops a request from the server it was recorded on after the socket no longer names a server', () => {
    const server: IServerLike = {};
    const req: IRequestLike = { socket: { server } };
    const res = new FakeResponse();
    const state = { live: new Set(), options: {}, response: res } as unknown as IRequestCancelState;

    trackRequest(req, state);
    expect(getRequestRegistry(server)?.open.get(res)).toBe(req);

    // an HTTP/2 compat request loses its socket server once the stream closes
    req.socket = null;
    expect(getRequestServer(req)).toBeUndefined();

    res.end();

    expect(getRequestRegistry(server)?.open.size).toBe(0);
  });

  it('records each request once however many layers track it', () => {
    const server: IServerLike = {};
    const req: IRequestLike = { socket: { server } };
    const res = new FakeResponse();
    const state = { live: new Set(), options: {}, response: res } as unknown as IRequestCancelState;

    trackRequest(req, state);
    trackRequest(req, state);

    expect(res.listenerCount('close')).toBe(1);
  });
});

describe('connection tracking', () => {
  it('records a plain server connection until it closes, and subscribes once', () => {
    const server = new EventEmitter();
    const host = server as unknown as IServerLike;
    const socket = new EventEmitter();

    trackConnections(host);
    trackConnections(host);
    server.emit('connection', socket);

    expect(server.listenerCount('connection')).toBe(1);
    expect(getRequestRegistry(host)?.connections?.has(socket)).toBe(true);

    socket.emit('close');

    expect(getRequestRegistry(host)?.connections?.size).toBe(0);
  });

  it('follows a TLS server through secureConnection, whose socket its requests carry', () => {
    const server = Object.assign(new EventEmitter(), { addContext: () => undefined });
    const host = server as unknown as IServerLike;
    const raw = new EventEmitter();
    const secure = new EventEmitter();

    trackConnections(host);
    server.emit('connection', raw);
    server.emit('secureConnection', secure);

    const connections = getRequestRegistry(host)?.connections;
    expect(connections?.has(raw)).toBe(false);
    expect(connections?.has(secure)).toBe(true);
  });
});
