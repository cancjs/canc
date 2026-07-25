import { createOrm } from './orm';
import { createApp } from './app';

// Test-only server entry. Runs the real app and counts the SQL statements MikroORM actually sends
// to PGlite (via its query logger), so the e2e tests can prove how much database work ran, and that
// a client cancel stops the rest. Never used by the shipped app; the plain entry is server/main.ts.

let queries = 0;

async function main(): Promise<void> {
  const bundle = await createOrm({ onQuery: () => (queries += 1) });
  const app = createApp(bundle);

  app.get('/api/_stats', (_req, res) => res.json({ queries }));
  app.post('/api/_stats/reset', (_req, res) => {
    queries = 0;
    res.end();
  });

  const server = app.listen(Number(process.env.PORT ?? 0), () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    // The harness reads this line to learn the port.
    console.log(`LISTENING ${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
