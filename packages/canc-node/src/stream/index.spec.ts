import { isCancelError } from '@cancjs/promise';

import * as streamExports from './index';
import {
  addAbortSignal,
  Duplex,
  duplexPair,
  finished,
  PassThrough,
  pipeline,
  Readable,
  Transform,
  Writable,
} from './index';

const LIFECYCLE_EVENTS = ['close', 'end', 'finish', 'error'] as const;

function totalListeners(stream: Readable | Writable): number {
  return LIFECYCLE_EVENTS.reduce((sum, event) => sum + stream.listenerCount(event), 0);
}

describe('@cancjs/node/stream module exports', () => {
  it('exports exactly the promise wrappers and the structural re-exports', () => {
    const expected = new Set([
      'pipeline',
      'finished',
      'Readable',
      'Writable',
      'Duplex',
      'Transform',
      'PassThrough',
      'addAbortSignal',
      'duplexPair',
      'text',
      'json',
      'buffer',
      'arrayBuffer',
      'blob',
      'bytes',
      'toArray',
      'some',
      'every',
      'find',
      'forEach',
      'reduce',
    ]);

    expect(new Set(Object.keys(streamExports))).toEqual(expected);
  });

  it('re-exports the stream classes and their static construction helpers structurally', () => {
    expect(typeof Readable).toBe('function');
    expect(typeof Readable.from).toBe('function');
    expect(typeof Writable).toBe('function');
    expect(typeof Duplex).toBe('function');
    expect(typeof Duplex.from).toBe('function');
    expect(typeof Transform).toBe('function');
    expect(typeof PassThrough).toBe('function');
    expect(typeof addAbortSignal).toBe('function');
    if (typeof duplexPair !== 'undefined') {
      expect(typeof duplexPair).toBe('function');
    } else {
      expect(duplexPair).toBeUndefined();
    }
  });
});

describe('pipeline', () => {
  it('canceled mid-flow rejects CancelError and destroys every stream in the chain', async () => {
    const source = new Readable({ read() {} });
    const destination = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });

    const p = pipeline(source, destination);
    p.cancel('stop reading');

    let caught: unknown;
    try {
      await p;
    } catch (err) {
      caught = err;
    }

    expect(isCancelError(caught)).toBe(true);
    expect(source.destroyed).toBe(true);
    expect(destination.destroyed).toBe(true);
  });

  it('destroys every stream in a longer chain, not just the source', async () => {
    const source = new Readable({ read() {} });
    const transform = new Transform({
      transform(chunk, _encoding, callback) {
        callback(null, chunk);
      },
    });
    const destination = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });

    const p = pipeline(source, transform, destination);
    p.cancel();

    await expect(p).rejects.toThrow();
    expect(source.destroyed).toBe(true);
    expect(transform.destroyed).toBe(true);
    expect(destination.destroyed).toBe(true);
  });

  it('rejects its own error unchanged when not canceled, and isCancelError is false', async () => {
    const boom = new Error('boom');
    const source = new Readable({
      read() {
        this.destroy(boom);
      },
    });
    const destination = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });

    let caught: any;
    try {
      await pipeline(source, destination);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe('boom');
    expect(isCancelError(caught)).toBe(false);
  });

  it('adopts a caller-supplied signal, aborting it cancels the same as calling cancel()', async () => {
    const source = new Readable({ read() {} });
    const destination = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const controller = new AbortController();

    const p = pipeline(source, destination, { signal: controller.signal });
    controller.abort();

    let caught: unknown;
    try {
      await p;
    } catch (err) {
      caught = err;
    }

    expect(isCancelError(caught)).toBe(true);
    expect(source.destroyed).toBe(true);
    expect(destination.destroyed).toBe(true);
  });
});

describe('finished', () => {
  it('canceled removes the listeners it registered, counts match before and after', async () => {
    const stream = new PassThrough();
    const baseline = totalListeners(stream);

    const p = finished(stream);
    expect(totalListeners(stream)).toBeGreaterThan(baseline);

    p.cancel();
    await expect(p).rejects.toThrow();

    expect(totalListeners(stream)).toBe(baseline);
  });

  it('resolves once the stream ends, without being canceled', async () => {
    const stream = new PassThrough();
    stream.resume();
    const p = finished(stream);

    stream.end();

    await expect(p).resolves.toBeUndefined();
  });
});
