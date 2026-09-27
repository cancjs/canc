import { createApp as createCancApp } from '../server/app-canc';
import { createApp as createVanillaApp } from '../server/app-vanilla';
import { createOrm } from '../server/orm';

// Test-only server entry to count SQL statements and prove cancellation.

let queries = 0;

async function main(): Promise<void> {
  const createApp = process.env.CANC_FLAVOR === 'vanilla' ? createVanillaApp : createCancApp;
  const ormConnData = await createOrm({ onQuery: () => (queries += 1) });
  const app = createApp(ormConnData);

  app.get('/api/_stats', (_req, res) => res.json({ queries }));
  app.post('/api/_stats/reset', (_req, res) => {
    queries = 0;
    res.end();
  });

  const server = app.listen(Number(process.env.PORT ?? 0), () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    console.log(`LISTENING ${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
