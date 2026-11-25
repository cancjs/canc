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

describe('native hook registration errors', () => {
  it.each([false, true])('preserves invalid async callback array rejection (plugin=%s)', async (auto) => {
    const instance = Fastify();

    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- retain native AsyncFunction identity under ES5 tests
    const requestHook = new Function('return async function (request, reply, done) {}')();
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- retain native AsyncFunction identity under ES5 tests
    const parserHook = new Function('return async function (request, reply, payload, done) {}')();

    try {
      if (auto) await instance.register(cancelPlugin);
      expect(() => instance.get('/bad-request', { onRequest: [requestHook] }, () => 'ok')).toThrow(
        expect.objectContaining({ code: 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER' }),
      );
      expect(() => instance.post('/bad-parser', { preParsing: [parserHook] }, () => 'ok')).toThrow(
        expect.objectContaining({ code: 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER' }),
      );
    } finally {
      await instance.close();
    }
  });
});
