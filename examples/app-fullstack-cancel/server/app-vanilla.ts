import express, { type Express } from 'express';

import { ormReqContext } from './lib/orm-req-context-vanilla';
import type { OrmConnectionData } from './orm';
import { searchRouter } from './routes-vanilla';

// The vanilla app. Same request-context middleware shape as canc, but the fork carries no signal; the
// routes read the signal and thread it into the queries by hand.
export function createApp({ orm, inflightQueryAbortStrategy }: OrmConnectionData): Express {
  const app = express();
  app.use(ormReqContext(orm, { inflightQueryAbortStrategy }));
  app.use(searchRouter);
  return app;
}
