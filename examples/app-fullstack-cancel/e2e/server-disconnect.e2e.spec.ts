import http from 'node:http';
import { startServer, request, sleep, type ServerHandle, type Flavor } from './harness';

// The server layer, both flavors: when the client socket goes away, the search stops and the
// database stops getting statements. Proven against the real MikroORM + PGlite stack in a subprocess.
describe.each<Flavor>(['canc', 'vanilla'])('%s: disconnect stops the query chain', (flavor) => {
  let server: ServerHandle;
  let fullCount = 0;

  beforeAll(async () => {
    server = await startServer(flavor);
    await server.resetStats();
    await request(`${server.base}/api/search?q=an`);
    fullCount = await server.queryCount();
  }, 60_000);

  afterAll(async () => {
    await server?.stop();
  });

  test('a completed search runs the whole statement chain', () => {
    expect(fullCount).toBeGreaterThan(1);
  });

  test('disconnecting mid-search stops the remaining statements', async () => {
    await server.resetStats();

    const req = http.get(`${server.base}/api/search?q=an`);
    req.on('error', () => {});
    await sleep(40);
    req.destroy();
    await sleep(700);

    const ran = await server.queryCount();
    expect(ran).toBeGreaterThan(0);
    expect(ran).toBeLessThan(fullCount);
  });
});
