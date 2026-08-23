// scenario comparing rollback on disconnect vs uncancelable commit
import http from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { sleep } from '@shared/util';
import type { DataSource } from 'typeorm';

import { countInvoices } from './invoice-repo';

interface AppBundle {
  app: INestApplication;
  dataSource: DataSource;
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

  const request = http.request({ host: '127.0.0.1', port, path: '/invoices/bulk', method: 'POST' }, (res) =>
    res.resume(),
  );
  request.on('error', () => {}); // socket destroy surfaces here
  request.end();

  // let first couple chunks run, then disconnect
  await sleep(60);
  request.destroy();

  // wait for potential uncancelled run to complete before comparing counts
  await sleep(600);
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
