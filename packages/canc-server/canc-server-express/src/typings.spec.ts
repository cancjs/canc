import { CancelSignal } from '@cancjs/promise';
import type { Express, Request, RequestHandler, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { Server } from 'http';

import { cancelableHandler, drain, getRequestSignal } from './index';

// This suite asserts at compile time. ts-jest reports type errors as test failures, so a signature
// that stops inferring fails the run rather than passing silently.

describe('handler inference', () => {
  it('infers both parameters of a bare generator handler', () => {
    const handler = cancelableHandler(function* (req, res) {
      // no annotation anywhere above, so these two only compile while inference holds
      const url: string = req.url;
      res.status(200).send(url);
    });

    expectHandler(handler);
  });

  it('carries the body and query types into the handler', () => {
    const handler = cancelableHandler<ParamsDictionary, { total: number }, { value: string }, { page: string }>(
      function* (req, res) {
        const value: string = req.body.value;
        const page: string = req.query.page;

        res.json({ total: value.length + page.length });
      },
    );

    expectHandler(handler);
  });

  it('carries the route parameter types into the handler', () => {
    const handler = cancelableHandler<{ id: string }>(function* (req, res) {
      const id: string = req.params.id;

      res.send(id);
    });

    expectHandler(handler);
  });

  it('accepts a plain handler alongside the generator form', () => {
    const handler = cancelableHandler(async (_req, res) => {
      res.send('ok');
    });

    expectHandler(handler);
  });

  it('rejects a handler expecting more than express passes', () => {
    const build = () =>
      // @ts-expect-error express passes three arguments, so a fourth cannot be inferred
      cancelableHandler(function* (_req, _res, _next, _extra) {
        /**/
      });

    expect(build).toBeInstanceOf(Function);
  });
});

describe('other exports', () => {
  it('takes any express request and response for the signal', () => {
    const req = {} as Request<{ id: string }, unknown, { value: string }>;
    const res = {} as Response<unknown>;
    // the annotated return type is the assertion: a request carrying its own parameter, body and
    // query types still reaches the signal without a cast
    const read = (): CancelSignal => getRequestSignal(req, res);

    expect(read).toBeInstanceOf(Function);
  });

  it('drains the http server and not the app that runs on it', () => {
    const server = {} as Server;
    const app = {} as Express;
    const good = () => drain(server);
    const bad = () =>
      // @ts-expect-error a drain needs the http server, which is what app.listen() hands back
      drain(app);

    expect(good).toBeInstanceOf(Function);
    expect(bad).toBeInstanceOf(Function);
  });
});

function expectHandler(handler: RequestHandler<any, any, any, any, any>): void {
  expect(typeof handler).toBe('function');
}
