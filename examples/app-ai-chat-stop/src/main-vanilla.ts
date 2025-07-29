// Vanilla entry: boots the express server, then drives a scripted Stop against it so the run has
// a deterministic end. Watch the usage log: the abortable route stops billing, the leaky route
// does not. Open http://localhost:PORT to try the browser client by hand.

import { createServer } from './server-vanilla';
import { runScenario } from './scenario';

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
