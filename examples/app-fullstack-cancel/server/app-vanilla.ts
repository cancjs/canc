import express, { type Express } from 'express';

import { ormReqContext } from './lib/orm-req-context-vanilla';
import type { OrmConnectionData } from './orm';
import { searchRouter } from './routes-vanilla';

// middleware binds the signal to the fork, but routes still check it between statements
export function createApp({ orm, inflightQueryAbortStrategy }: OrmConnectionData): Express {
  const app = express();
  app.use(ormReqContext(orm, { inflightQueryAbortStrategy }));
  app.use(searchRouter);
  return app;
}
