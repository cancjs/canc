import { getLiveRequests, getRequestServer, IRequestCancelState, trackRequest, untrackRequest } from './holder';
import { IRequestLike, IServerLike } from './types';

describe('request holder', () => {
  it('drops a request from the server it was tracked on after the socket no longer names a server', () => {
    const server: IServerLike = {};
    const req: IRequestLike = { socket: { server } };
    const state = { options: {}, live: new Set() } as unknown as IRequestCancelState;

    trackRequest(req, state);
    expect(getLiveRequests(server)?.has(state)).toBe(true);

    // an HTTP/2 compat request loses its socket server once the stream closes
    req.socket = null;
    expect(getRequestServer(req)).toBeUndefined();

    untrackRequest(req, state);

    expect(getLiveRequests(server)?.size).toBe(0);
  });
});
