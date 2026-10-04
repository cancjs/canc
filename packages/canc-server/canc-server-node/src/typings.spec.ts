import { CancelSignal } from '@cancjs/promise';
import type { IncomingMessage, Server, ServerResponse } from 'http';

import { cancelableHandler, getRequestSignal, shutdown } from './index';

// This suite asserts at compile time. ts-jest reports type errors as test failures, so a signature
// that stops inferring fails the run rather than passing silently.

describe('handler inference', () => {
  it('infers both parameters of a bare generator handler', () => {
    const handler = cancelableHandler(function* (req, res) {
      // no annotation anywhere above, so these two only compile while inference holds
      const url: string | undefined = req.url;
      res.end(url);
    });

    expectHandler(handler);
  });

  it('accepts a plain handler alongside the generator form', () => {
    const handler = cancelableHandler(async (_req, res) => {
      res.end('ok');
    });

    expectHandler(handler);
  });

  it('rejects a handler expecting more than node passes', () => {
    const build = () =>
      // @ts-expect-error a node request listener takes two arguments, so a third cannot be inferred
      cancelableHandler(function* (_req, _res, _extra) {
        /**/
      });

    expect(build).toBeInstanceOf(Function);
  });
});

describe('other exports', () => {
  it('takes any node request and response for the signal', () => {
    const req = {} as IncomingMessage;
    const res = {} as ServerResponse;
    const read = (): CancelSignal => getRequestSignal(req, res);

    expect(read).toBeInstanceOf(Function);
  });

  it('shuts down the raw http server', () => {
    const server = {} as Server;
    const good = () => shutdown(server);

    expect(good).toBeInstanceOf(Function);
  });
});

function expectHandler(handler: (req: IncomingMessage, res: ServerResponse) => void): void {
  expect(typeof handler).toBe('function');
}
