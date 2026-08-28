import { type MikroORM, RequestContext } from '@mikro-orm/core';
import type { RequestHandler } from 'express';

import type { InflightQueryAbortStrategy } from '../orm';
import { getReqSignal } from './get-req-signal-vanilla';

/**
 * One middleware that gives every request its own EntityManager fork, bound to the request's abort
 * signal, published through MikroORM's RequestContext.
 *
 * Binding the signal to the fork is a MikroORM feature, so this side does it too: queries stop on
 * their own in both flavors. What the signal cannot do is stop the handler between two queries.
 * Compare orm-req-context-canc.ts: there the handler is a coroutine and every step is a cancellation
 * point, so nothing downstream mentions a signal. Here the handler still reads the same signal back
 * and checks it by hand (see routes-vanilla.ts and search-service-vanilla.ts).
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
