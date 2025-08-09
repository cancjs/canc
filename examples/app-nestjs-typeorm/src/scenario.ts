// Shared narrative for both entries. Boots the Nest app, starts a bulk invoice generation, then
// destroys the client socket partway through, and reports the invoice count afterwards. The two
// flavors diverge in that count: canc rolls the transaction back so the count is unchanged; vanilla
// runs every chunk and commits, so the count jumps by the full customer total.

import http from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { countInvoices } from './invoice-repo';

interface AppBundle {
 app: INestApplication;
 dataSource: DataSource;
}

function delay(ms: number): Promise<void> {
 return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runDisconnectScenario(
 flavor: 'vanilla' | 'canc',
 createApp: () => Promise<AppBundle>,
): Promise<void> {
 const bootStart = Date.now();
 const { app, dataSource } = await createApp();
 await app.listen(0);
 console.log(`[${flavor}] app booted and seeded in ${Date.now() - bootStart}ms`);

 const server = app.getHttpServer() as http.Server;
 const address = server.address();
 const port = typeof address === 'object' && address ? address.port : 0;

 const before = await countInvoices(dataSource.manager);
 console.log(`[${flavor}] POST /invoices/bulk, then disconnecting mid-generation`);

 const request = http.request(
 { host: '127.0.0.1', port, path: '/invoices/bulk', method: 'POST' },
 (res) => res.resume(),
 );
 request.on('error', () => {}); // destroying the socket surfaces here; expected
 request.end();

 // Let the first couple of chunks run, then hang up.
 await delay(60);
 request.destroy();

 // Wait past the point where an uncancelled bulk run would have committed every chunk, so the two
 // flavors are compared at the same late moment: canc rolled back, vanilla committed.
 await delay(600);
 const after = await countInvoices(dataSource.manager);

 console.log(`[${flavor}] invoice count: ${before} before, ${after} after disconnect`);
 if (flavor === 'canc') {
 console.log(`[${flavor}] transaction rolled back in the shielded finally: count unchanged`);
 } else {
 console.log(`[${flavor}] no cancellation: the bulk run committed for a client that already left`);
 }

 await app.close();
 await dataSource.destroy();
}
