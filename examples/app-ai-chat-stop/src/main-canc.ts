import '@cancjs/unhandled-rejection/register';

// Canc entry: boots the express server, then drives the same scripted Stop. The canc route cancels
// the whole chain on disconnect, so the usage log shows the stream stopped early. Open
// http://localhost:PORT to try the browser client by hand.
import { runScenario } from './scenario';
import { createServer } from './server-canc';

async function main(): Promise<void> {
  const { app, log } = createServer();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  console.log(`canc: listening on http://localhost:${port}`);

  await runScenario(port, log, 'canc');

  server.close();
  console.log('canc: done');
}

main();
