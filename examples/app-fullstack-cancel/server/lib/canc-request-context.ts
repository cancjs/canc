import type { RequestHandler } from 'express';
import { RequestContext, type EntityManager, type MikroORM } from '@mikro-orm/core';
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

/**
 * The request-scoped EntityManager, captured while the request context is live. Grab it at the top
 * of a handler and pass it down; its abort signal stays wired for every query. Throws if the
 * context is missing, which means cancRequestContext() was not installed ahead of this route. That
 * is a wiring bug worth failing loudly on, rather than silently querying an unsignaled global manager.
 */
export function requestEm(): EntityManager {
  const em = RequestContext.getEntityManager();
  if (!em) {
    throw new Error('No request EntityManager. Install cancRequestContext(orm) before this route.');
  }
  return em;
}
