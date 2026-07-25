import { isCancelError } from '@cancjs/promise';
import { createApi, createHttp } from '../client/api';
import { startServer, sleep, type ServerHandle } from './harness';

// The whole stack: the real cancelable-axios client cancels a request, and the cancellation reaches
// the database. This is the browser-to-DB path from the article, minus the browser.
let server: ServerHandle;
let fullCount = 0;

beforeAll(async () => {
  server = await startServer();
  const api = createApi(createHttp(`${server.base}/api`));
  await server.resetStats();
  await api.search('an');
  fullCount = await server.queryCount();
}, 60_000);

afterAll(async () => {
  await server?.stop();
});

test('a completed client search returns hits', async () => {
  const api = createApi(createHttp(`${server.base}/api`));
  const hits = await api.search('an');
  expect(hits.length).toBeGreaterThan(0);
  expect(hits[0]).toHaveProperty('cityCount');
});

test('canceling the client request stops work at the database', async () => {
  const api = createApi(createHttp(`${server.base}/api`));
  await server.resetStats();

  const task = api.search('an');
  setTimeout(() => task.cancel('user canceled'), 40);

  let canceled = false;
  try {
    await task;
  } catch (error) {
    canceled = isCancelError(error);
  }
  expect(canceled).toBe(true);

  await sleep(700);
  const ran = await server.queryCount();
  expect(ran).toBeGreaterThan(0);
  expect(ran).toBeLessThan(fullCount);
});
