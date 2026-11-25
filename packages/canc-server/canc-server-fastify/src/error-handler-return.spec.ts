import { CancelError } from '@cancjs/promise';
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import { runInThisContext } from 'vm';

import { cancelErrorHandler } from './plugin';

const cases = ['sync', 'async', 'reject', 'sent', 'serializer'] as const;
type TCase = (typeof cases)[number];

async function exchange(mode: TCase, wrapped: boolean) {
  const warnings: string[] = [];
  const app = Fastify({
    logger: {
      level: 'warn',
      stream: {
        write: (line: string) => {
          warnings.push(line);
        },
      },
    },
  });
  const host = runInThisContext('process') as NodeJS.Process;
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  const failure = new Error('ORIGINAL');
  let sends = 0;
  const onError = jest.fn((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    expect(error).toBe(failure);
    expect(request.url).toBe('/mapped');
    if (mode === 'sent') {
      void reply.code(418).send({ origin: 'mapper', marker: 'SENT' });

      return;
    }
    if (mode === 'reject') {
      return Promise.reject(new Error('MAPPER_REJECT'));
    }
    if (mode === 'serializer') {
      reply.serializer(() => 'CUSTOM_SERIALIZER');

      return { origin: 'mapper', marker: 'SERIALIZED' };
    }
    const body = { origin: 'mapper', marker: mode.toUpperCase() };

    return mode === 'async' ? Promise.resolve(body) : body;
  });
  app.addHook('onRequest', (_request, reply, done) => {
    const send = reply.send;
    reply.send = function (payload) {
      sends++;

      return send.call(this, payload);
    };
    done();
  });
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- the void-compatible mapper intentionally returns a promise to Fastify
  app.setErrorHandler(wrapped ? cancelErrorHandler({ onError }) : onError);
  app.get('/mapped', () => {
    throw failure;
  });
  host.on('unhandledRejection', onUnhandled);
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const response = await Promise.race([
      app.inject('/mapped'),
      new Promise<'NO_END'>((resolve) => {
        timer = setTimeout(() => resolve('NO_END'), 750);
      }),
    ]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    return {
      body: response === 'NO_END' ? response : response.body,
      calls: onError.mock.calls.length,
      sends,
      status: response === 'NO_END' ? undefined : response.statusCode,
      unhandled: unhandled.map(String),
      doubleReply: warnings.filter((line) => line.includes('FST_ERR_REP_ALREADY_SENT')).length,
    };
  } finally {
    clearTimeout(timer);
    host.off('unhandledRejection', onUnhandled);
    await app.close();
  }
}

describe('Fastify returned error handler results', () => {
  it.each(cases)('matches native %s response', async (mode) => {
    const native = await exchange(mode, false);
    const wrapped = await exchange(mode, true);

    expect(native).toMatchObject({
      calls: 1,
      status:
        mode === 'reject' ? 500
        : mode === 'sent' ? 418
        : 200,
      unhandled: [],
      doubleReply: 0,
    });
    if (mode === 'reject') {
      expect(JSON.parse(native.body)).toMatchObject({ statusCode: 500, message: 'MAPPER_REJECT' });
    } else if (mode === 'serializer') {
      expect(native.body).toBe('CUSTOM_SERIALIZER');
    } else {
      expect(JSON.parse(native.body)).toEqual({ origin: 'mapper', marker: mode.toUpperCase() });
    }
    expect(wrapped).toEqual(native);
  });

  it('keeps caller cancellation away from a returned-body mapper', async () => {
    const app = Fastify();
    const onError = jest.fn(() => ({ marker: 'unexpected' }));
    app.setErrorHandler(cancelErrorHandler({ onError }));
    app.get('/caller', () => {
      throw new CancelError('CALLER_CANCEL');
    });

    try {
      const response = await app.inject('/caller');
      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toMatchObject({ message: 'CALLER_CANCEL' });
      expect(onError).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
