import type { RequestHandler } from 'express';
import { RequestContext, type MikroORM } from '@mikro-orm/core';
import { getReqSignal } from './get-req-signal-canc';
import type { InflightQueryAbortStrategy } from '../orm';

/**
 * One middleware that gives every request its own EntityManager fork, bound to the request's abort
 * signal, published through MikroORM's RequestContext. Route handlers then use the ambient fork with
 * no fork call and no signal: cancellation reaches the database on its own. The fork signal is
 * inherited by the request-scoped fork, so all queries in the request cancel together on disconnect.
 */
export function ormReqContext(
  orm: MikroORM,
  options: { inflightQueryAbortStrategy?: InflightQueryAbortStrategy } = {},
): RequestHandler {
  const inflightQueryAbortStrategy = options.inflightQueryAbortStrategy ?? 'ignore query';
  return (req, res, next) => {
    const fork = orm.em.fork({ signal: getReqSignal(req, res), inflightQueryAbortStrategy });
    RequestContext.create(fork, next);
  };
}
