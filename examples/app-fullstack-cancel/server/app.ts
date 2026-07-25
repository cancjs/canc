import express, { type Express } from 'express';
import type { OrmBundle } from './orm';
import { cancRequestContext } from './lib/canc-request-context';
import { createSearchRouter } from './routes';

/**
 * Builds the express app. One middleware wires per-request cancellation into the ORM; the routes
 * stay signal-free.
 */
export function createApp(bundle: OrmBundle): Express {
  const app = express();
  app.use(
    cancRequestContext(bundle.orm, {
      inflightQueryAbortStrategy: bundle.inflightQueryAbortStrategy,
    }),
  );
  app.use(createSearchRouter());
  return app;
}
