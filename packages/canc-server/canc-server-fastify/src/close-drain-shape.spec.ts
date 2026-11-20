import http from 'node:http';

import Fastify from 'fastify';

import { cancelableHandler, cancelPlugin } from './index';
import { ICloseDrain } from './shutdown';

const closeDrainFields: { [K in keyof Required<ICloseDrain>]: true } = {
  boot: true,
  hooked: true,
  options: true,
  warned: true,
};

describe('fastify close drain holder shape', () => {
  it('pins the fields shared by every installed copy', () => {
    expect(Object.keys(closeDrainFields).sort()).toEqual(['boot', 'hooked', 'options', 'warned']);
  });

  it('keeps the registry key stable', () => {
    expect(Symbol.for('@cancjs/server-fastify:CloseDrain')).toBe(Symbol.for('@cancjs/server-fastify:CloseDrain'));
  });

  it('honors options on a drain written by an older copy', async () => {
    const app = Fastify();
    const key = Symbol.for('@cancjs/server-fastify:CloseDrain');
    const preset: ICloseDrain = { options: { cancelAfter: 100 } };
    Object.defineProperty(app.server, key, { configurable: true, value: preset, writable: true });
    await app.register(cancelPlugin);

    let reached!: () => void;
    const started = new Promise<void>((resolve) => {
      reached = resolve;
    });
    app.get(
      '/hang',
      cancelableHandler(function* () {
        reached();
        yield new Promise(() => undefined);
      }),
    );

    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('expected a listening TCP port');
    }

    const response = new Promise<number | undefined>((resolve, reject) => {
      const outgoing = http.get({ host: '127.0.0.1', port: address.port, path: '/hang' }, (reply) => {
        reply.resume();
        reply.once('end', () => resolve(reply.statusCode));
      });
      outgoing.once('error', reject);
    });

    await started;
    const began = Date.now();
    await app.close();
    expect(Date.now() - began).toBeLessThan(2000);
    await expect(response).resolves.toBe(503);
    expect((app.server as unknown as Record<symbol, ICloseDrain>)[key]).toBe(preset);
  });
});
