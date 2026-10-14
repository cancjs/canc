import { CancelError } from './cancel-error';
import { CancelablePromise, type IExecutorContext } from './cancelable-promise';
import { isCancelError } from './helpers';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// a real AbortSignal turns an undefined reason into a DOMException, this one keeps it
function fakeSignal() {
  const listeners = new Set<() => void>();
  const signal = {
    aborted: false,
    reason: undefined as unknown,
    addEventListener: (_type: 'abort', listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: 'abort', listener: () => void) => {
      listeners.delete(listener);
    },
  };
  const abort = (reason: unknown): void => {
    signal.aborted = true;
    signal.reason = reason;
    for (const listener of [...listeners]) listener();
  };
  return { signal, abort };
}

const reasonRows: [string, () => unknown][] = [
  ['string', () => 'stop'],
  ['Error', () => new Error('boom')],
  ['CancelError', () => new CancelError('why')],
  ['undefined', () => undefined],
  ['DOMException', () => new DOMException('gone', 'AbortError')],
];

interface IOutcome {
  handlerArgs: unknown[];
  error: any;
}

async function cancelPreAborted(reason: unknown): Promise<IOutcome> {
  const { signal, abort } = fakeSignal();
  abort(reason);
  const promise = new CancelablePromise<void>(() => undefined, { signal });
  const handlerArgs: unknown[] = [];
  promise.handleCancel((r) => void handlerArgs.push(r), { immediate: true });
  const error: unknown = await promise.catch((e: unknown) => e);
  await flush();
  return { handlerArgs, error };
}

async function cancelLive(reason: unknown): Promise<IOutcome> {
  const { signal, abort } = fakeSignal();
  const handlerArgs: unknown[] = [];
  const promise = new CancelablePromise<void>(
    (_resolve, _reject, { handleCancel }) => {
      handleCancel((r) => void handlerArgs.push(r));
    },
    { signal },
  );
  abort(reason);
  promise.handleCancel((r) => void handlerArgs.push(r), { immediate: true });
  const error: unknown = await promise.catch((e: unknown) => e);
  await flush();
  return { handlerArgs, error };
}

async function cancelDuringExecutor(reason: unknown): Promise<IOutcome> {
  const { signal, abort } = fakeSignal();
  const handlerArgs: unknown[] = [];
  const promise = new CancelablePromise<void>(
    (_resolve, _reject, { handleCancel }) => {
      handleCancel((r) => void handlerArgs.push(r));
      abort(reason);
    },
    { signal },
  );
  const error: unknown = await promise.catch((e: unknown) => e);
  await flush();
  return { handlerArgs, error };
}

// same rule as cancel(): CancelError as is, other objects as cause, the rest as message
function expectRejectionFor(error: any, reason: unknown): void {
  expect(isCancelError(error)).toBe(true);
  if (isCancelError(reason)) {
    expect(error).toBe(reason);
  } else if (typeof reason === 'object' && reason !== null) {
    expect(error.cause).toBe(reason);
    expect(error.message).toBe('');
  } else {
    expect('cause' in error).toBe(false);
    expect(error.message).toBe(reason === undefined ? '' : reason);
  }
}

describe('abort reason rule', () => {
  describe.each(reasonRows)('%s reason', (_label, makeReason) => {
    it('pre-aborted: handler gets the raw reason, rejection follows the rule', async () => {
      const reason = makeReason();
      const { handlerArgs, error } = await cancelPreAborted(reason);
      expect(handlerArgs).toHaveLength(1);
      expect(handlerArgs[0]).toBe(reason);
      expectRejectionFor(error, reason);
    });

    it('live abort: handler gets the raw reason, rejection follows the rule', async () => {
      const reason = makeReason();
      const { handlerArgs, error } = await cancelLive(reason);
      expect(handlerArgs).toHaveLength(2);
      expect(handlerArgs[0]).toBe(reason);
      expect(handlerArgs[1]).toBe(reason);
      expectRejectionFor(error, reason);
    });

    it('abort during the executor matches the live abort', async () => {
      const reason = makeReason();
      const { handlerArgs, error } = await cancelDuringExecutor(reason);
      expect(handlerArgs).toEqual([reason]);
      expectRejectionFor(error, reason);
    });

    it('pre-aborted and live abort reject with the same shape', async () => {
      const reason = makeReason();
      const pre = await cancelPreAborted(reason);
      const live = await cancelLive(reason);
      expect(pre.handlerArgs[0]).toBe(live.handlerArgs[0]);
      expect(pre.error.message).toBe(live.error.message);
      expect(pre.error.cause).toBe(live.error.cause);
      expect('cause' in pre.error).toBe('cause' in live.error);
    });
  });

  it('a platform AbortController reason becomes the cause on both paths', async () => {
    const preController = new AbortController();
    preController.abort();
    const pre = new CancelablePromise<void>(() => undefined, { signal: preController.signal });
    const preError: any = await pre.catch((e: unknown) => e);

    const liveController = new AbortController();
    const live = new CancelablePromise<void>(() => undefined, { signal: liveController.signal });
    liveController.abort();
    const liveError: any = await live.catch((e: unknown) => e);

    expect(preError.cause).toBe(preController.signal.reason);
    expect(liveError.cause).toBe(liveController.signal.reason);
    expect(preError.aborted).toBe(true);
    expect(liveError.aborted).toBe(true);
  });

  it.each(reasonRows)('direct cancel with a %s reason follows the same rule', async (_label, makeReason) => {
    const reason = makeReason();
    const promise = new CancelablePromise<void>(() => undefined);
    void promise.cancel(reason);
    const error: unknown = await promise.catch((e: unknown) => e);
    expectRejectionFor(error, reason);
  });
});

describe('executor getSignal', () => {
  function capture(options?: { strict?: boolean; signal?: any }, settle?: boolean) {
    let ctx!: IExecutorContext<void>;
    const promise = new CancelablePromise<void>((resolve, _reject, c) => {
      ctx = c;
      if (settle) resolve();
    }, options);
    return { promise, ctx };
  }

  it('first called after cancel returns an aborted signal carrying the CancelError', async () => {
    const { promise, ctx } = capture();
    void promise.cancel('stop');
    const signal = ctx.getSignal();
    expect(signal.aborted).toBe(true);
    const error: unknown = await promise.catch((e: unknown) => e);
    expect(isCancelError(signal.reason)).toBe(true);
    expect(signal.reason).toBe(error);
  });

  it('called before cancel aborts on cancel with the CancelError', async () => {
    const { promise, ctx } = capture();
    const signal = ctx.getSignal();
    expect(signal.aborted).toBe(false);
    const reason = new Error('boom');
    void promise.cancel(reason);
    expect(signal.aborted).toBe(true);
    const error: any = await promise.catch((e: unknown) => e);
    expect(signal.reason).toBe(error);
    expect(error.cause).toBe(reason);
  });

  it('carries the rejection CancelError when an option signal aborts', async () => {
    const { signal: source, abort } = fakeSignal();
    const { promise, ctx } = capture({ signal: source });
    const signal = ctx.getSignal();
    const reason = new DOMException('gone', 'AbortError');
    abort(reason);
    const error: any = await promise.catch((e: unknown) => e);
    expect(signal.reason).toBe(error);
    expect(error.cause).toBe(reason);
  });

  it('carries an external CancelError rejection as the reason', async () => {
    let reject!: (reason?: any) => void;
    let ctx!: IExecutorContext<void>;
    const promise = new CancelablePromise<void>((_resolve, rej, c) => {
      reject = rej;
      ctx = c;
    });
    const signal = ctx.getSignal();
    const external = new CancelError('external');
    reject(external);
    await promise.catch(() => undefined);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(external);
  });

  it('keeps throwing under strict on a settled promise', () => {
    const { ctx } = capture({ strict: true }, true);
    expect(() => ctx.getSignal()).toThrow('Settled promise cannot add cancel handler');
    expect(() => ctx.getSignal()).toThrow('Settled promise cannot add cancel handler');
  });
});
