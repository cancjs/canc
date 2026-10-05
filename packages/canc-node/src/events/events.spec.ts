import nodeAssert from 'node:assert';
import nodeEvents from 'node:events';

import { isCancelError } from '@cancjs/promise';

import { addAbortListener, EventEmitter, ICancelableEventIterator, on, once } from './index';

type TEventsModule = typeof import('./index');

/** Drain microtasks and the abort listeners node schedules behind them. */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/** The rejection of a promise that is expected to be canceled, without leaving it unhandled. */
function outcomeOf(promise: PromiseLike<unknown>): Promise<unknown> {
  return Promise.resolve(promise).then(
    () => 'fulfilled',
    (error: unknown) => error,
  );
}

/** Load the module with the feature flag forced, so both branches run on one runtime. */
function loadEvents(hasAddAbortListener: boolean): TEventsModule {
  let loaded: TEventsModule | undefined;

  jest.isolateModules(() => {
    jest.doMock('../features', () => ({ features: { hasAddAbortListener } }));
    loaded = require('./index') as TEventsModule;
  });

  jest.dontMock('../features');

  return loaded!;
}

describe('once', () => {
  it('resolves with the emitted arguments', async () => {
    const emitter = new EventEmitter();
    const waiter = once(emitter, 'ready');

    emitter.emit('ready', 'first', 'second');

    await expect(waiter).resolves.toEqual(['first', 'second']);
  });

  it('removes the listener when canceled', async () => {
    const emitter = new EventEmitter();
    const waiter = once(emitter, 'ready');
    const outcome = outcomeOf(waiter);

    expect(emitter.listenerCount('ready')).toBe(1);
    expect(emitter.listenerCount('error')).toBe(1);

    waiter.cancel();
    await flush();

    expect(emitter.listenerCount('ready')).toBe(0);
    expect(emitter.listenerCount('error')).toBe(0);

    const error = await outcome;
    expect(isCancelError(error)).toBe(true);
    expect((error as Error).name).toBe('CancelError');
  });

  it('keeps the listener while a second consumer still wants the event', async () => {
    const emitter = new EventEmitter();
    const waiter = once(emitter, 'ready');
    const abandoned = waiter.then(([value]: any[]) => value as number);
    const wanted = waiter.then(([value]: any[]) => (value as number) + 1);
    const outcome = outcomeOf(abandoned);

    abandoned.cancel();
    await flush();

    expect(emitter.listenerCount('ready')).toBe(1);

    emitter.emit('ready', 41);

    await expect(wanted).resolves.toBe(42);
    expect(isCancelError(await outcome)).toBe(true);
  });

  it('removes the listener once every consumer is canceled', async () => {
    const emitter = new EventEmitter();
    const waiter = once(emitter, 'ready');
    const first = waiter.then(([value]: any[]) => value as number);
    const second = waiter.then(([value]: any[]) => value as number);
    // the source promise gets no observer of its own here: another consumer would keep the
    // listener alive, which is the very behavior under test
    const outcomes = Promise.all([outcomeOf(first), outcomeOf(second)]);

    first.cancel();
    await flush();

    expect(emitter.listenerCount('ready')).toBe(1);

    second.cancel();
    await flush();

    expect(emitter.listenerCount('ready')).toBe(0);
    expect(emitter.listenerCount('error')).toBe(0);

    for (const outcome of await outcomes) {
      expect(isCancelError(outcome)).toBe(true);
    }
  });

  it('cancels through a signal the caller passed in the options bag', async () => {
    const emitter = new EventEmitter();
    const controller = new AbortController();
    const waiter = once(emitter, 'ready', { signal: controller.signal });
    const outcome = outcomeOf(waiter);

    controller.abort();
    await flush();

    expect(emitter.listenerCount('ready')).toBe(0);
    expect(isCancelError(await outcome)).toBe(true);
  });

  it('rejects the emitter error, which is not a cancellation', async () => {
    const emitter = new EventEmitter();
    const waiter = once(emitter, 'ready');
    const failure = new Error('boom');
    const outcome = outcomeOf(waiter);

    emitter.emit('error', failure);

    expect(await outcome).toBe(failure);
    expect(isCancelError(failure)).toBe(false);
  });
});

describe('on', () => {
  it('iterates the emitted arguments', async () => {
    const emitter = new EventEmitter();
    const iterator = on(emitter, 'tick');

    emitter.emit('tick', 1);
    emitter.emit('tick', 2);

    await expect(iterator.next()).resolves.toEqual({ value: [1], done: false });
    await expect(iterator.next()).resolves.toEqual({ value: [2], done: false });

    await iterator.return();
  });

  it('ends the iteration and removes every listener when a pull is canceled', async () => {
    const emitter = new EventEmitter();
    const iterator = on(emitter, 'tick');
    const pending = iterator.next();
    const outcome = outcomeOf(pending);

    expect(emitter.listenerCount('tick')).toBe(1);
    expect(emitter.listenerCount('error')).toBe(1);

    pending.cancel();
    await flush();

    expect(emitter.listenerCount('tick')).toBe(0);
    expect(emitter.listenerCount('error')).toBe(0);
    expect(isCancelError(await outcome)).toBe(true);

    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it('surfaces a thrown error as a failure, not a cancellation', async () => {
    const emitter = new EventEmitter();
    const iterator = on(emitter, 'tick');
    // node checks the argument against its own realm's Error, which the test realm's is not
    const failure = new nodeAssert.AssertionError({ message: 'boom' });

    await iterator.throw(failure);

    expect(emitter.listenerCount('tick')).toBe(0);

    const outcome = await outcomeOf(iterator.next());

    expect(outcome).toBe(failure);
    expect(isCancelError(outcome)).toBe(false);
  });

  it('stops a for await loop and leaves no listener behind', async () => {
    const emitter = new EventEmitter();
    const iterator: ICancelableEventIterator = on(emitter, 'tick');
    const seen: number[] = [];

    const loop = (async (): Promise<void> => {
      for await (const [value] of iterator) {
        seen.push(value as number);
      }
    })();
    const outcome = outcomeOf(loop);

    emitter.emit('tick', 1);
    await flush();

    expect(seen).toEqual([1]);

    await iterator.return();
    await outcome;

    expect(emitter.listenerCount('tick')).toBe(0);
    expect(emitter.listenerCount('error')).toBe(0);
  });
});

describe('addAbortListener', () => {
  it('is node implementation where the feature exists', () => {
    const nativeModule = loadEvents(true);

    expect(nativeModule.addAbortListener).toBe(nodeEvents.addAbortListener);
    expect(addAbortListener).toBe(nodeEvents.addAbortListener);
  });

  it('is the fallback where the feature is missing', () => {
    const fallbackModule = loadEvents(false);

    expect(typeof fallbackModule.addAbortListener).toBe('function');
    expect(fallbackModule.addAbortListener).not.toBe(nodeEvents.addAbortListener);
  });

  it.each([
    ['node', true],
    ['the fallback', false],
  ])('calls the listener on abort through %s', async (_label: string, hasFeature: boolean) => {
    const module = loadEvents(hasFeature);
    const controller = new AbortController();
    const seen: string[] = [];

    module.addAbortListener(controller.signal, (event: Event) => {
      seen.push(event.type);
    });

    controller.abort();
    await flush();

    expect(seen).toEqual(['abort']);
  });

  it.each([
    ['node', true],
    ['the fallback', false],
  ])('stops listening once disposed through %s', async (_label: string, hasFeature: boolean) => {
    const module = loadEvents(hasFeature);
    const controller = new AbortController();
    let calls = 0;

    const disposable = module.addAbortListener(controller.signal, () => {
      calls += 1;
    });

    disposable[Symbol.dispose]();
    controller.abort();
    await flush();

    expect(calls).toBe(0);
    expect(controller.signal.aborted).toBe(true);
  });

  it.each([
    ['node', true],
    ['the fallback', false],
  ])(
    'calls the listener asynchronously for a signal already aborted through %s',
    async (_label: string, hasFeature: boolean) => {
      const module = loadEvents(hasFeature);
      const controller = new AbortController();
      controller.abort();

      let calls = 0;
      module.addAbortListener(controller.signal, () => {
        calls += 1;
      });

      expect(calls).toBe(0);

      await flush();

      expect(calls).toBe(1);
    },
  );

  it.each([
    ['node', true],
    ['the fallback', false],
  ])(
    'disposes without effect after an already aborted signal through %s',
    async (_label: string, hasFeature: boolean) => {
      const module = loadEvents(hasFeature);
      const controller = new AbortController();
      controller.abort();

      let calls = 0;
      const disposable = module.addAbortListener(controller.signal, () => {
        calls += 1;
      });

      expect(() => disposable[Symbol.dispose]()).not.toThrow();

      await flush();

      expect(calls).toBe(1);
    },
  );
});

describe('EventEmitter', () => {
  it('is node class, unmodified', () => {
    expect(EventEmitter).toBe(nodeEvents);
    expect(new EventEmitter()).toBeInstanceOf(nodeEvents);
  });
});
