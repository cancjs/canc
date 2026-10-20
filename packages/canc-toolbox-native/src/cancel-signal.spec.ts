import { makeCancelSignal } from '../../_toolbox';
import { createErrorClass, isCancelError } from '../../_util';
import { promisify } from './index';

// this twin ships no CancelError, so the spec mints one carrying the shared brand
const CancelError = createErrorClass('CancelError', '@cancjs/promise:CancelError');

function captureHandleCancel() {
  const state: { onCancel?: (reason?: any) => void } = {};
  const handleCancel = (onCancel: (reason?: any) => void) => {
    state.onCancel = onCancel;
  };

  return { state, handleCancel };
}

describe('getSignal() first called after cancel', () => {
  it('makeCancelSignal returns an already aborted signal carrying the cancel reason', () => {
    const { state, handleCancel } = captureHandleCancel();
    const holder = makeCancelSignal(handleCancel);

    const reason = new CancelError('late');
    state.onCancel!(reason);

    const signal = holder.getSignal();
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(reason);
    expect(isCancelError(signal.reason)).toBe(true);
  });

  it('a lazy promisify signal captured in transformArgs and first read after abort is aborted', async () => {
    let getLater: (() => any) | undefined;
    const inbound = new AbortController();
    const fn = promisify((_cb: (err: unknown) => void) => undefined, {
      lazy: true,
      signal: inbound.signal,
      transformArgs: (args, getSignal) => {
        getLater = getSignal;
        return args;
      },
    });

    const settled = fn().then(
      () => 'fulfilled',
      () => 'rejected',
    );
    await Promise.resolve();
    const reason = new CancelError('stop');
    inbound.abort(reason);
    await settled;

    const signal = getLater!();
    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);
  });
});

describe('signal accessor', () => {
  it('is a non-enumerable getter on the holder and on the getSignal function', () => {
    let built = 0;
    const Ctor = class {
      signal = { aborted: false };
      constructor() {
        built++;
      }
      abort() {
        this.signal.aborted = true;
      }
    };
    const holder = makeCancelSignal(() => undefined, Ctor);

    expect(Object.keys(holder)).not.toContain('signal');
    expect('signal' in { ...holder }).toBe(false);
    expect(Object.keys(holder.getSignal)).not.toContain('signal');
    JSON.stringify(holder);
    expect(built).toBe(0);

    expect(holder.signal).toBe(holder.getSignal());
    expect(holder.getSignal.signal).toBe(holder.signal);
    expect(built).toBe(1);
  });

  it('a lazy promisify transformArgs can destructure signal off getSignal', async () => {
    let injected: any;
    const inbound = new AbortController();
    const fn = promisify((_opts: unknown, _cb: (err: unknown) => void) => undefined, {
      lazy: true,
      signal: inbound.signal,
      transformArgs: (args, { signal }) => {
        injected = signal;
        return [{ signal }];
      },
    });

    const settled = fn().then(
      () => 'fulfilled',
      () => 'rejected',
    );
    await Promise.resolve();
    inbound.abort(new CancelError('stop'));
    await settled;
    expect(injected.aborted).toBe(true);
  });
});
