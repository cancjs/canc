import cancelableAxios from '@cancjs/axios';
import { isCancelError } from '@cancjs/promise';

import { type Flavor, type ServerHandle, sleep, startServer } from './harness';

// The whole stack, both flavors: a cancelable-axios request is canceled, and the cancellation
// reaches the database. This is the browser-to-DB path from the article, minus the browser.
describe.each<Flavor>(['canc', 'vanilla'])('%s: canceling the request stops DB work', (flavor) => {
  let server: ServerHandle;
  let fullCount = 0;

  beforeAll(async () => {
    server = await startServer(flavor);
    const api = cancelableAxios.create({ baseURL: `${server.base}/api` });
    await server.resetStats();
    await api.get('/search', { params: { q: 'an' } });
    fullCount = await server.queryCount();
  }, 60_000);

  afterAll(async () => {
    await server?.stop();
  });

  test('a completed request returns hits', async () => {
    const api = cancelableAxios.create({ baseURL: `${server.base}/api` });
    const response = await api.get<{ id: number }[]>('/search', { params: { q: 'an' } });
    expect(response.data.length).toBeGreaterThan(0);
  });

  test('canceling the request stops work at the database', async () => {
    const api = cancelableAxios.create({ baseURL: `${server.base}/api` });
    await server.resetStats();

    const task = api.get('/search', { params: { q: 'an' } });
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
});
