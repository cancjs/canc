import express from 'express';
import { cancelOnDisconnect } from './middleware-canc';
import { createReportRouter } from './routes-canc';
import { createReportDb } from './mock/db';
import { runDisconnectScenario } from './scenario';

/** Builds the canc server: disconnect middleware installed before the report routes. */
export function createApp() {
 const rdb = createReportDb();
 const app = express();
 app.use(cancelOnDisconnect);
 app.use(createReportRouter(rdb));
 return { app, rdb };
}

if (require.main === module) {
 runDisconnectScenario('canc', createApp).then(
 () => process.exit(0),
 (error) => {
 console.error(error);
 process.exit(1);
 },
 );
}
