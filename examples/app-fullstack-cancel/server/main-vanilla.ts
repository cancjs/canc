import { createOrm } from './orm';
import { createApp } from './app-vanilla';

const PORT = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  const ormConnData = await createOrm();
  const app = createApp(ormConnData);
  app.listen(PORT, () => {
    console.log(`[server:vanilla] ${ormConnData.driver} on http://127.0.0.1:${PORT} (search /api/search?q=)`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
