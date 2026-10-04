import Fastify from 'fastify';

import { cancelPlugin } from './plugin';

// fastify checks the plugin's declared range against its own version at register time, so a
// floor-only range is what keeps registration working on a fastify major newer than this repo's
describe('fastify version range', () => {
  it('registers against a newer major without throwing', async () => {
    const instance = Fastify();

    Object.defineProperty(instance, 'version', { configurable: true, value: '6.0.0' });

    await expect(instance.register(cancelPlugin).ready()).resolves.toBe(instance);

    await instance.close();
  });
});
