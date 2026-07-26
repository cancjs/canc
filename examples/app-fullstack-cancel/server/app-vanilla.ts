import express, { type Express } from 'express';
import type { OrmConnectionData } from './orm';
import { vanillaReqContext } from './middleware-vanilla';
import { searchRouter } from './routes-vanilla';

// The vanilla app. The middleware exposes a per-request signal and fork; the routes thread the signal by hand.
export function createApp({ orm, inflightQueryAbortStrategy }: OrmConnectionData): Express {
  const app = express();
  app.use(vanillaReqContext(orm, { inflightQueryAbortStrategy }));
  app.use(searchRouter);
  return app;
}
