import express, { type Express } from 'express';
import type { OrmConnectionData } from './orm';
import { ormReqContext } from './lib/orm-req-context-canc';
import { searchRouter } from './routes-canc';

// The canc app. One middleware wires per-request cancellation into the ORM; the routes stay signal-free.
export function createApp({ orm, inflightQueryAbortStrategy }: OrmConnectionData): Express {
  const app = express();
  app.use(ormReqContext(orm, { inflightQueryAbortStrategy }));
  app.use(searchRouter);
  return app;
}
