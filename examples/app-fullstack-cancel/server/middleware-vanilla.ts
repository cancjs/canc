import type { Request, RequestHandler } from 'express';
import type { EntityManager, MikroORM } from '@mikro-orm/core';
import type { InflightQueryAbortStrategy } from './orm';

// Manual per-request cancellation, no canc. An AbortController is aborted on disconnect and a plain
// EntityManager fork is stashed on the request. The handler threads the signal into every query by
// hand. Compare ormReqContext, which wires all of this once and leaves the handler signal-free.
const REQ_DB = Symbol.for('canc.request.vanillaDb');

interface RequestDb {
  em: EntityManager;
  signal: AbortSignal;
}

export function vanillaReqContext(
  orm: MikroORM,
  options: { inflightQueryAbortStrategy?: InflightQueryAbortStrategy } = {},
): RequestHandler {
  const inflightQueryAbortStrategy = options.inflightQueryAbortStrategy ?? 'ignore query';
  return (req, res, next) => {
    const controller = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    const holder = req as unknown as Record<symbol, RequestDb>;
    holder[REQ_DB] = { em: orm.em.fork({ inflightQueryAbortStrategy }), signal: controller.signal };
    next();
  };
}

export function reqDb(req: Request): RequestDb {
  const holder = req as unknown as Record<symbol, RequestDb | undefined>;
  const db = holder[REQ_DB];
  if (!db) {
    throw new Error('No request db. Install vanillaReqContext(orm) before this route.');
  }
  return db;
}
