import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'stream';

import { es5Task } from '../../../../tests-types/fixtures/common/server-fastify-es5-auto';
import { cancelableHandler } from './handler';
import { cancelPlugin } from './plugin';

const noop = () => undefined;

async function bounded<T>(pending: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('inject did not finish')), 750);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function nativeTask(): typeof es5Task {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- native generator control for the ES5-compiled suite
  return new Function(
    'return function* (step, value, finish) { try { step(); yield Promise.resolve(); return value; } finally { finish(); } }',
  )();
}

describe('result-based Fastify generator dispatch', () => {
  it('drives actual ES5 and native generator results and conditional returns exactly once', async () => {
    const app = Fastify();
    const calls: string[] = [];
    const steps: string[] = [];
    const finals: string[] = [];
    const native = nativeTask();
    expect(Object.prototype.toString.call(es5Task)).toBe('[object Function]');
    expect(Object.prototype.toString.call(native)).toBe('[object GeneratorFunction]');
    await app.register(cancelPlugin);

    const make = (mode: string, factory = es5Task) =>
      factory(
        () => {
          steps.push(mode);
        },
        { mode },
        () => {
          finals.push(mode);
        },
      );

    app.get('/es5', () => {
      calls.push('es5');
      return make('es5');
    });
    app.get('/native', () => {
      calls.push('native');
      return make('native', native);
    });
    app.get<{ Params: { mode: string } }>('/mixed/:mode', function (request, _reply) {
      expect(this).toBe(app);
      expect(arguments.length).toBe(2);
      const mode = request.params.mode;
      calls.push(mode);

      return (
        mode === 'gen' ? make(mode)
        : mode === 'promise' ? Promise.resolve({ mode })
        : { mode }
      );
    });

    try {
      for (const [uri, mode] of [
        ['/es5', 'es5'],
        ['/native', 'native'],
        ['/mixed/plain', 'plain'],
        ['/mixed/gen', 'gen'],
        ['/mixed/promise', 'promise'],
        ['/mixed/plain', 'plain'],
      ]) {
        const response = await bounded(app.inject(uri));
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ mode });
      }
      expect(calls).toEqual(['es5', 'native', 'plain', 'gen', 'promise', 'plain']);
      expect(steps).toEqual(['es5', 'native', 'gen']);
      expect(finals).toEqual(steps);
    } finally {
      await app.close();
    }
  });

  it('preserves callback ABI, stage order and returned preParsing streams', async () => {
    const app = Fastify();
    const events: string[] = [];
    let callbackDone = 0;
    await app.register(cancelPlugin);
    const generatorHook = function* (this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
      expect(this).toBe(app);
      expect(request.url).toBe('/hook');
      expect(reply.request).toBe(request);
      events.push('onRequest-gen');
      yield Promise.resolve();
      events.push('onRequest-gen-end');
    };
    app.get(
      '/hook',
      {
        onRequest: [
          function (request, reply, done) {
            expect(this).toBe(app);
            expect(arguments.length).toBe(3);
            expect(reply.request).toBe(request);
            events.push('onRequest-cb');
            callbackDone++;
            done();
          },
          generatorHook as never,
        ],
        preValidation: function (this: FastifyInstance, request: FastifyRequest, reply: FastifyReply, _done: unknown) {
          expect(this).toBe(app);
          expect(arguments.length).toBe(3);
          expect(reply.request).toBe(request);
          events.push('preValidation-factory');

          return es5Task(
            () => {
              events.push('preValidation-step');
            },
            undefined,
            () => {
              events.push('preValidation-final');
            },
          );
        } as never,
        preHandler: [
          function* () {
            events.push('preHandler-gen');
            yield Promise.resolve();
          } as never,
          function (_request, _reply, done) {
            events.push('preHandler-cb');
            callbackDone++;
            done();
          },
        ],
      },
      () => {
        events.push('route');
        return { via: 'hook' };
      },
    );

    app.post(
      '/parse',
      {
        preParsing: [
          function (request, reply, payload, done) {
            expect(this).toBe(app);
            expect(arguments.length).toBe(4);
            expect(reply.request).toBe(request);
            events.push('parser-cb');
            callbackDone++;
            done(null, payload);
          },
          function* (_request: FastifyRequest, _reply: FastifyReply, payload: Readable) {
            events.push('parser-gen');
            yield Promise.resolve();

            return payload;
          } as never,
          function (
            this: FastifyInstance,
            _request: FastifyRequest,
            _reply: FastifyReply,
            _payload: Readable,
            _done: unknown,
          ) {
            expect(arguments.length).toBe(4);
            expect(this).toBe(app);
            events.push('parser-gen-cb-factory');

            return es5Task(
              () => {
                events.push('parser-gen-cb-step');
              },
              Readable.from(['{"hello":3}']),
              noop,
            );
          } as never,
        ],
      },
      (request) => ({ payload: request.body }),
    );

    try {
      const response = await bounded(app.inject('/hook'));
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ via: 'hook' });
      expect(events).toEqual([
        'onRequest-cb',
        'onRequest-gen',
        'onRequest-gen-end',
        'preValidation-factory',
        'preValidation-step',
        'preValidation-final',
        'preHandler-gen',
        'preHandler-cb',
        'route',
      ]);
      const parsed = await bounded(app.inject({ method: 'POST', url: '/parse', payload: { hello: 1 } }));
      expect(parsed.statusCode).toBe(200);
      expect(parsed.json()).toEqual({ payload: { hello: 3 } });
      expect(events.slice(-4)).toEqual(['parser-cb', 'parser-gen', 'parser-gen-cb-factory', 'parser-gen-cb-step']);
      expect(callbackDone).toBe(3);
    } finally {
      await app.close();
    }
  });

  it('matches native values, callbacks and throws without touching iterator accessors', async () => {
    async function scenario(auto: boolean) {
      const app = Fastify();
      let reads = 0;
      let pulls = 0;
      let doneCalls = 0;
      if (auto) await app.register(cancelPlugin);
      app.get('/plain', () => ({ kind: 'plain' }));
      app.get('/promise', async () => ({ kind: 'promise' }));
      app.get('/thenable', () => ({
        then(resolve: (value: unknown) => void) {
          resolve({ kind: 'thenable' });
        },
      }));
      app.get('/array', () => [1, 2, 3]);
      app.get('/getter', () =>
        Object.defineProperty({ kind: 'getter' }, 'next', {
          enumerable: false,
          get() {
            reads++;
            throw new Error('getter must not run');
          },
        }),
      );
      app.get('/iterator', () => ({
        kind: 'iterator',
        next() {
          pulls++;
          return { done: true };
        },
        [Symbol.iterator]() {
          pulls++;
          return this;
        },
      }));
      app.get(
        '/callback',
        {
          preHandler: function (_request, _reply, done) {
            expect(this).toBe(app);
            expect(arguments.length).toBe(3);
            doneCalls++;
            done();
          },
        },
        () => ({ kind: 'callback' }),
      );
      app.get('/throw', () => {
        throw new Error('NATIVE_THROW');
      });
      try {
        const results = [];
        for (const uri of ['plain', 'promise', 'thenable', 'array', 'getter', 'iterator', 'callback', 'throw']) {
          const response = await bounded(app.inject('/' + uri));
          results.push({ status: response.statusCode, body: response.json() });
        }
        expect(reads).toBe(0);
        expect(pulls).toBe(0);
        expect(doneCalls).toBe(1);

        return results;
      } finally {
        await app.close();
      }
    }
    const native = await scenario(false);
    expect(native.map((result) => result.status)).toEqual([200, 200, 200, 200, 200, 200, 200, 500]);
    expect(native[7].body).toMatchObject({ message: 'NATIVE_THROW' });
    expect(await scenario(true)).toEqual(native);
  });

  it.each(['native', 'es5', 'explicit'] as const)('preabort %s factory boundary', async (mode) => {
    const app = Fastify();
    const controller = new AbortController();
    let factories = 0;
    let steps = 0;
    let finals = 0;
    const step = () => {
      steps++;
    };
    const finish = () => {
      finals++;
    };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- exercise the native tagged factory itself
    const native = new Function(
      'step',
      'finish',
      'return function* () { try { step(); yield Promise.resolve(); return { ok: true }; } finally { finish(); } }',
    )(step, finish) as () => Generator;
    const original = mode === 'native' ? native : () => es5Task(step, { ok: true }, finish);
    const route = new Proxy(original, {
      apply(target, receiver, args) {
        factories++;

        return Reflect.apply(target, receiver, args);
      },
    });
    await app.register(cancelPlugin, { signal: controller.signal });
    app.get('/', mode === 'explicit' ? cancelableHandler(route) : route);
    controller.abort('pre-aborted');

    try {
      const response = await bounded(app.inject('/'));
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ message: 'pre-aborted', statusCode: 503 });
      expect(factories).toBe(mode === 'explicit' ? 0 : 1);
      expect(steps).toBe(0);
      expect(finals).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('leaves pre-registered routes and disabled automatic dispatch native', async () => {
    const app = Fastify();
    const step = jest.fn();
    app.get('/early', () => es5Task(step, { ok: true }, noop));
    await app.register(cancelPlugin, { autoWrap: false });
    app.get('/off', () => es5Task(step, { ok: true }, noop));

    try {
      for (const uri of ['/early', '/off']) {
        const response = await bounded(app.inject(uri));
        expect(response.statusCode).toBe(200);
        expect(response.body).toBe('{}');
      }
      expect(step).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
