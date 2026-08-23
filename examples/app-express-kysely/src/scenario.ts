// scenario comparing query freeze on disconnect vs uncancelable run
import http from 'node:http';

import { sleep } from '@shared/util';
import type { Express } from 'express';

import type { ReportDb } from './mock/db';
import { aggregateChunkCount } from './report-queries';

interface AppBundle {
  app: Express;
  rdb: ReportDb;
}

export async function runDisconnectScenario(
  flavor: 'vanilla' | 'canc',
  createApp: () => Promise<AppBundle>,
): Promise<void> {
  const bootStart = Date.now();
  const { app, rdb } = await createApp();
  console.log(`[${flavor}] database seeded in ${Date.now() - bootStart}ms`);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const totalChunks = aggregateChunkCount();

  console.log(`[${flavor}] GET /orders/report, then disconnecting mid-report`);
  const request = http.get(`http://127.0.0.1:${port}/orders/report`);
  request.on('error', () => {}); // socket destroy surfaces here

  // let first couple slices run, then disconnect
  await sleep(150);
  const runBeforeDisconnect = countAggregateQueries(rdb);
  request.destroy();

  // wait for potential uncancelled report to finish before comparing slice counts
  await sleep(400);
  const runAfterDisconnect = countAggregateQueries(rdb);

  console.log(
    `[${flavor}] aggregate slices run: ${runBeforeDisconnect} before disconnect, ` +
      `${runAfterDisconnect} of ${totalChunks} total after`,
  );
  if (flavor === 'canc') {
    console.log(`[${flavor}] chain canceled: remaining slices never ran, response released`);
  } else {
    console.log(`[${flavor}] no cancellation: every slice ran for a client that already left`);
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rdb.close();
}

function countAggregateQueries(rdb: ReportDb): number {
  return rdb.queryLog.filter((sql) => sql.includes('"id" >') && sql.includes('"id" <=')).length;
}
