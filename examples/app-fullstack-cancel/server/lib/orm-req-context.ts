import type { RequestHandler } from 'express';
import { RequestContext, type EntityManager, type MikroORM } from '@mikro-orm/core';
import { getReqSignal } from './get-req-signal';
import type { InflightQueryAbortStrategy } from '../orm';

/**
 * One middleware that gives every request its own EntityManager fork, bound to the request's abort
 * signal, through MikroORM's own AsyncLocalStorage (RequestContext). Route handlers then use the
 * ambient fork with no fork call and no signal: cancellation reaches the database on its own.
 *
 * This is the piece that removes the manual `orm.em.fork({ signal, ... })` from every handler. The
 * fork signal is inherited by the request-scoped fork, so all queries in the request cancel together
 * when the client disconnects.
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

/**
 * The request-scoped EntityManager. Call it at the top of a handler, before the first await, while
 * the async context is still live, then pass the fork down: its abort signal stays wired for every
 * query no matter when it runs. After an await the context has moved on and this would not find it.
 * Throws if the context is missing, which means ormReqContext() was not installed ahead of the route
 * (a wiring bug worth failing loudly on, rather than silently querying an unsignaled global manager).
 */
export function getReqEm(): EntityManager {
  const em = RequestContext.getEntityManager();
  if (!em) {
    throw new Error('No request EntityManager. Install ormReqContext(orm) before this route.');
  }
  return em;
}
