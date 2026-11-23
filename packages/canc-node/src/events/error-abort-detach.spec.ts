import { EventEmitter, getEventListeners } from 'node:events';

import { isCancelError } from '@cancjs/promise';

import { on } from './index';

describe('event iterator terminal ownership', () => {
  it('detaches nine failed pulls from a long-lived signal', async () => {
    const controller = new AbortController();
    const counts: number[] = [];
    try {
      for (let i = 0; i < 9; i++) {
        const emitter = new EventEmitter();
        const iterator = on(emitter, 'data', { signal: controller.signal });
        const pending = iterator.next();
        const failure = new Error('source error');
        emitter.emit('error', failure);
        await expect(pending).rejects.toBe(failure);
        expect(emitter.listenerCount('data')).toBe(0);
        expect(emitter.listenerCount('error')).toBe(0);
        counts.push(getEventListeners(controller.signal, 'abort').length);
      }
      expect(counts).toEqual(Array(9).fill(0));
    } finally {
      controller.abort();
    }
  });

  it('detaches on a for-await error without removing a sibling iterator', async () => {
    const controller = new AbortController();
    const first = new EventEmitter();
    const second = new EventEmitter();
    const failure = new Error('source error');
    const sibling = on(second, 'data', { signal: controller.signal });
    const iterator = on(first, 'data', { signal: controller.signal });
    const loop = (async () => {
      for await (const _ of iterator) {
        // The source fails before producing an item.
      }
    })();
    try {
      first.emit('error', failure);
      await expect(loop).rejects.toBe(failure);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);
      second.emit('data', 41);
      await expect(sibling.next()).resolves.toEqual({ value: [41], done: false });
      await sibling.return();
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    } finally {
      controller.abort();
      await sibling.return();
    }
  });

  it('detaches an iterator whose caller aborted before its first pull', async () => {
    const controller = new AbortController();
    const emitter = new EventEmitter();
    controller.abort();
    const iterator = on(emitter, 'data', { signal: controller.signal });
    await new Promise((resolve) => setImmediate(resolve));
    const outcome = await iterator.next().catch((error: unknown) => error);
    expect(isCancelError(outcome)).toBe(true);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(emitter.listenerCount('data')).toBe(0);
    expect(emitter.listenerCount('error')).toBe(0);
  });
});
