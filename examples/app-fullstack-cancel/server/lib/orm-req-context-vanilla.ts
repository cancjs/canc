import type { RequestHandler } from 'express';
import { RequestContext, type MikroORM } from '@mikro-orm/core';
import type { InflightQueryAbortStrategy } from '../orm';

/**
 * One middleware that gives every request its own EntityManager fork, published through MikroORM's
 * RequestContext. The fork carries no signal: the handler reads the request signal separately and
 * threads it into every query by hand (see get-req-signal-vanilla.ts and search-service-vanilla.ts).
 * Compare orm-req-context-canc.ts, which binds the signal to the fork once and leaves the handler
 * signal-free.
 */
export function ormReqContext(
  orm: MikroORM,
  options: { inflightQueryAbortStrategy?: InflightQueryAbortStrategy } = {},
): RequestHandler {
  const inflightQueryAbortStrategy = options.inflightQueryAbortStrategy ?? 'ignore query';
  return (req, _res, next) => {
    const fork = orm.em.fork({ inflightQueryAbortStrategy });
    RequestContext.create(fork, next);
  };
}
