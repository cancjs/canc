import { getRequestSignal } from '@cancjs/server-express';
import { type MikroORM, RequestContext } from '@mikro-orm/core';
import type { RequestHandler } from 'express';

import type { InflightQueryAbortStrategy } from '../orm';

/**
 * One middleware that gives every request its own EntityManager fork, bound to the request's cancel
 * signal, published through MikroORM's RequestContext. Route handlers then use the ambient fork with
 * no fork call and no signal: cancellation reaches the database on its own.
 *
 * The signal is the same one the route wrapper runs the handler under, because the package installs
 * it once per request and hands the cached one to every later caller. So a disconnect fires a single
 * listener and stops the route coroutine and every query in the request together.
 */
export function ormReqContext(
  orm: MikroORM,
  options: { inflightQueryAbortStrategy?: InflightQueryAbortStrategy } = {},
): RequestHandler {
  const inflightQueryAbortStrategy = options.inflightQueryAbortStrategy ?? 'ignore query';
  return (req, res, next) => {
    const fork = orm.em.fork({ signal: getRequestSignal(req, res), inflightQueryAbortStrategy });
    RequestContext.create(fork, next);
  };
}
