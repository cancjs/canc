import express from 'express';

import { abortOnDisconnect } from './middleware-vanilla';
import { createReportDb } from './mock/db';
import { createReportRouter } from './routes-vanilla';
import { runDisconnectScenario } from './scenario';

/** Builds the vanilla server: abort middleware installed before the report routes. */
export function createApp() {
  const rdb = createReportDb();
  const app = express();
  app.use(abortOnDisconnect);
  app.use(createReportRouter(rdb));
  return { app, rdb };
}

if (require.main === module) {
  runDisconnectScenario('vanilla', createApp).then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
