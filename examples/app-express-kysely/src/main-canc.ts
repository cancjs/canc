import express from 'express';
import { createReportRouter } from './routes-canc';
import { createReportDb } from './mock/db';
import { runDisconnectScenario } from './scenario';

/** Builds the canc server. The report route cancels itself on disconnect, no middleware needed. */
export function createApp() {
 const rdb = createReportDb();
 const app = express();
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
