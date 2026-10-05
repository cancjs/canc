import nodeEvents from 'node:events';
import { Readable } from 'node:stream';

import { isCancelError } from '@cancjs/promise';

import { isNotImplementedError, NotImplementedError } from '../errors/classes';
import { features } from '../features';
import * as consumersExports from './consumers';
import { arrayBuffer, blob, buffer, bytes, json, text } from './consumers';

type TConsumersModule = typeof import('./consumers');

/** Drain microtasks and the reads node schedules behind them. */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/** The settlement of a promise expected to be canceled, without leaving it unhandled. */
function outcomeOf(promise: PromiseLike<unknown>): Promise<unknown> {
  return Promise.resolve(promise).then(
    (value) => value,
    (error: unknown) => error,
  );
}

/** Load the module with the feature flag forced, so both gate branches run on one runtime. */
function loadConsumers(hasConsumersBytes: boolean): TConsumersModule {
  let loaded: TConsumersModule | undefined;

  jest.isolateModules(() => {
    jest.doMock('../features', () => ({ features: { hasConsumersBytes } }));
    loaded = require('./consumers') as TConsumersModule;
  });

  jest.dontMock('../features');

  return loaded!;
}

/** A readable that yields one chunk and then stalls, so a consumer of it stays pending. */
function stalledSource(first: string): { stream: Readable; reads: () => number } {
  let reads = 0;

  const stream = new Readable({
    read() {
      reads += 1;
      if (reads === 1) {
        this.push(first);
      }
    },
  });

  return { stream, reads: () => reads };
}

describe('@cancjs/node stream consumers module exports', () => {
  it('exports exactly the six node consumers', () => {
    const expected = new Set(['text', 'json', 'buffer', 'arrayBuffer', 'blob', 'bytes']);

    expect(new Set(Object.keys(consumersExports))).toEqual(expected);
  });
});

describe('text', () => {
  it('fulfills with the whole stream as a string', async () => {
    await expect(text(Readable.from(['ab', 'cd']))).resolves.toBe('abcd');
  });

  it('canceled mid-read rejects CancelError and destroys the stream', async () => {
    const source = stalledSource('first ');
    const consumed = text(source.stream);
    const outcome = outcomeOf(consumed);

    await flush();
    expect(source.reads()).toBeGreaterThan(0);
    expect(source.stream.destroyed).toBe(false);

    consumed.cancel('stop reading');

    expect(isCancelError(await outcome)).toBe(true);
    expect(source.stream.destroyed).toBe(true);
  });

  it('leaves the stream alive and readable when destroyOnCancel is false', async () => {
    const source = stalledSource('first ');
    const consumed = text(source.stream, { destroyOnCancel: false });
    const outcome = outcomeOf(consumed);

    await flush();
    consumed.cancel();

    expect(isCancelError(await outcome)).toBe(true);
    expect(source.stream.destroyed).toBe(false);
    expect(source.stream.readable).toBe(true);

    // the read nothing tore down carries on and the stream reaches its normal end
    const ended = nodeEvents.once(source.stream, 'end');
    source.stream.push('rest');
    source.stream.push(null);
    await ended;

    expect(source.stream.readableEnded).toBe(true);
    expect(source.stream.errored).toBe(null);
  });

  it('has nothing to destroy when the source is not a node stream', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    async function* source(): AsyncGenerator<string> {
      yield 'first ';
      await gate;
      yield 'rest';
    }

    const consumed = text(source());
    const outcome = outcomeOf(consumed);

    await flush();
    consumed.cancel();

    expect(isCancelError(await outcome)).toBe(true);

    // the read no teardown could reach carries on, so let it end instead of leaving it pending
    release();
    await flush();
  });
});

describe('json', () => {
  it('fulfills with the parsed value', async () => {
    await expect(json(Readable.from(['{"a":', '1}']))).resolves.toEqual({ a: 1 });
  });

  it('rejects the parse error on malformed input, not a CancelError', async () => {
    const outcome = await outcomeOf(json(Readable.from(['{"a":'])));

    // node parses in its own realm, so the constructor identity does not survive; the name does
    expect((outcome as Error).name).toBe('SyntaxError');
    expect((outcome as Error).message).toContain('JSON');
    expect(isCancelError(outcome)).toBe(false);
  });
});

describe('buffer, arrayBuffer and blob', () => {
  it('fulfill with the whole stream in their own shape', async () => {
    expect((await buffer(Readable.from(['hi']))).toString()).toBe('hi');
    expect(new Uint8Array(await arrayBuffer(Readable.from(['hi'])))).toEqual(new Uint8Array([104, 105]));
    expect((await blob(Readable.from(['hi']))).size).toBe(2);
  });
});

describe('destroyOnCancel', () => {
  it('destroys the source by default for every ungated consumer', async () => {
    const consume = [text, json, buffer, arrayBuffer, blob];

    for (const consumer of consume) {
      const source = stalledSource('{');
      const consumed = consumer(source.stream);
      const outcome = outcomeOf(consumed);

      await flush();
      consumed.cancel();

      expect(isCancelError(await outcome)).toBe(true);
      expect(source.stream.destroyed).toBe(true);
    }
  });

  it('keeps the source for every ungated consumer when turned off', async () => {
    const consume = [text, json, buffer, arrayBuffer, blob];

    for (const consumer of consume) {
      const source = stalledSource('{');
      const consumed = consumer(source.stream, { destroyOnCancel: false });
      const outcome = outcomeOf(consumed);

      await flush();
      consumed.cancel();

      expect(isCancelError(await outcome)).toBe(true);
      expect(source.stream.destroyed).toBe(false);
      expect(source.stream.readable).toBe(true);

      source.stream.destroy();
    }
  });
});

describe('bytes', () => {
  it('throws NotImplementedError where the runtime does not carry it', () => {
    const source = Readable.from(['hi']);
    let thrown: unknown;

    try {
      loadConsumers(false).bytes(source);
    } catch (error) {
      thrown = error;
    }

    expect(isNotImplementedError(thrown)).toBe(true);
    expect((thrown as NotImplementedError).feature).toBe('consumers.bytes');
    source.destroy();
  });

  it('routes to node itself where the runtime does carry it', async () => {
    const wired = loadConsumers(true);
    expect(typeof wired.bytes).toBe('function');

    // on a runtime that really lacks bytes this rejects a TypeError, which is the point: forcing
    // the flag on bypasses the gate rather than producing a second NotImplementedError
    const outcome = await outcomeOf(wired.bytes(Readable.from(['hi'])));
    expect(isNotImplementedError(outcome)).toBe(false);
  });

  it('agrees with the feature detected on the running runtime', async () => {
    const absent = Readable.from(['hi']);

    if (!features.hasConsumersBytes) {
      expect(() => bytes(absent)).toThrow(NotImplementedError);
      absent.destroy();
      return;
    }

    await expect(bytes(Readable.from(['hi']))).resolves.toEqual(new Uint8Array([104, 105]));

    const source = stalledSource('hi');
    const consumed = bytes(source.stream);
    const outcome = outcomeOf(consumed);

    await flush();
    consumed.cancel();

    expect(isCancelError(await outcome)).toBe(true);
    expect(source.stream.destroyed).toBe(true);
  });
});
