// Vanilla entry: boots the express server, then drives a scripted Stop against it.

import { runScenario } from './scenario';
import { createServer } from './server-vanilla';

async function main(): Promise<void> {
  const { app, log } = createServer();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  console.log(`vanilla: listening on http://localhost:${port}`);

  await runScenario(port, log, 'vanilla');

  server.close();
  console.log('vanilla: done');
}

main();
