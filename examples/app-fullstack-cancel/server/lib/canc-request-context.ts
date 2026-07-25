import type { RequestHandler } from 'express';
import { RequestContext, type MikroORM } from '@mikro-orm/core';
import { reqSignal } from './req-signal';
import type { InflightQueryAbortStrategy } from '../orm';

/**
 * One middleware that gives every request its own EntityManager fork, bound to the request's abort
 * signal, through MikroORM's own AsyncLocalStorage (RequestContext). Route handlers then use the
 * ambient `orm.em` with no fork and no signal: cancellation reaches the database on its own.
 *
 * This is the piece that removes the manual `orm.em.fork({ signal: req.signal, ... })` from every
 * handler. The fork signal is inherited by the request-scoped fork, so all queries in the request
 * cancel together when the client disconnects.
 */
export function cancRequestContext(
  orm: MikroORM,
  options: { inflightQueryAbortStrategy?: InflightQueryAbortStrategy } = {},
): RequestHandler {
  const inflightQueryAbortStrategy = options.inflightQueryAbortStrategy ?? 'ignore query';
  return (req, res, next) => {
    const fork = orm.em.fork({ signal: reqSignal(req, res), inflightQueryAbortStrategy });
    RequestContext.create(fork, next);
  };
}
