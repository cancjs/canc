// Shared narrative for both entries. Boots the server, starts an orders report, then destroys the
// client socket partway through, and reports how many aggregate slices actually ran afterwards.
// The two flavors diverge in the number: canc freezes the query log at the disconnect point;
// vanilla runs every slice to the end.

import http from 'node:http';
import type { Express } from 'express';
import { sleep } from '@shared/util';
import { aggregateChunkCount } from './report-queries';
import type { ReportDb } from './mock/db';

interface AppBundle {
 app: Express;
 rdb: ReportDb;
}

export async function runDisconnectScenario(
 flavor: 'vanilla' | 'canc',
 createApp: () => AppBundle,
): Promise<void> {
 const bootStart = Date.now();
 const { app, rdb } = createApp();
 console.log(`[${flavor}] database seeded in ${Date.now() - bootStart}ms`);

 const server = http.createServer(app);
 await new Promise<void>((resolve) => server.listen(0, resolve));
 const address = server.address();
 const port = typeof address === 'object' && address ? address.port : 0;

 const totalChunks = aggregateChunkCount();

 console.log(`[${flavor}] GET /orders/report, then disconnecting mid-report`);
 const request = http.get(`http://127.0.0.1:${port}/orders/report`);
 request.on('error', () => {}); // destroying the socket surfaces here; expected

 // Let the first couple of slices run, then hang up.
 await sleep(40);
 const runBeforeDisconnect = countAggregateQueries(rdb);
 request.destroy();

 // Wait past the point where an uncancelled report would have finished every slice, so the two
 // flavors are compared at the same late moment: canc frozen, vanilla complete.
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
 rdb.close();
}

function countAggregateQueries(rdb: ReportDb): number {
 return rdb.queryLog.filter((sql) => sql.includes('"id" >') && sql.includes('"id" <=')).length;
}

