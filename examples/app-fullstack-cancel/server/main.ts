import { createOrm } from './orm';
import { createApp } from './app';

const PORT = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  const bundle = await createOrm();
  const app = createApp(bundle);
  app.listen(PORT, () => {
    console.log(`[server] ${bundle.driver} ready on http://127.0.0.1:${PORT} (search /api/search?q=)`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
