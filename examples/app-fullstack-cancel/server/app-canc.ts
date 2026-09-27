import express, { type Express } from 'express';

import { ormReqContext } from './lib/orm-req-context-canc';
import type { OrmConnectionData } from './orm';
import { searchRouter } from './routes-canc';

// middleware wires cancellation into ORM so routes stay signal-free
export function createApp({ orm, inflightQueryAbortStrategy }: OrmConnectionData): Express {
  const app = express();
  app.use(ormReqContext(orm, { inflightQueryAbortStrategy }));
  app.use(searchRouter);
  return app;
}
