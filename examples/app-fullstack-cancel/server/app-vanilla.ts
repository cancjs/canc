import express, { type Express } from 'express';

import { ormReqContext } from './lib/orm-req-context-vanilla';
import type { OrmConnectionData } from './orm';
import { searchRouter } from './routes-vanilla';

// fork carries no signal so routes thread signals into queries by hand
export function createApp({ orm, inflightQueryAbortStrategy }: OrmConnectionData): Express {
  const app = express();
  app.use(ormReqContext(orm, { inflightQueryAbortStrategy }));
  app.use(searchRouter);
  return app;
}
