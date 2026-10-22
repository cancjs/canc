import { FakeResponse } from './__tests__/fakes';
import { getRequestRegistry, getRequestServer, IRequestCancelState, trackRequest } from './holder';
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
