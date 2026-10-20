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
