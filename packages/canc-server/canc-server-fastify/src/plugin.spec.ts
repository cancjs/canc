import Fastify from 'fastify';

import { cancelableHandler, cancelableHook, cancelablePreParsing } from './handler';
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

describe('timeout options at setup', () => {
  it('rejects invalid plugin options at boot rather than on a request', async () => {
    const instance = Fastify();

    try {
      instance.register(cancelPlugin, { timeout: { ms: Infinity, status: 600 } });
      await expect(instance.ready()).rejects.toThrow(
        new RangeError('timeout status (600) must be an integer from 200 to 599'),
      );
    } finally {
      await instance.close();
    }
  });

  it('rejects invalid options at all explicit factory sites', () => {
    const handler = jest.fn();
    const options = { timeout: { ms: -1, status: 200.5 } };
    const expected = new RangeError('timeout status (200.5) must be an integer from 200 to 599');

    expect(() => cancelableHandler(handler, options)).toThrow(expected);
    expect(() => cancelableHook(handler, options)).toThrow(expected);
    expect(() => cancelablePreParsing(handler, options)).toThrow(expected);
    expect(handler).not.toHaveBeenCalled();
  });
});
