import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';
import { catchCancel, makeCancelable, suppressCancel } from './helpers';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// An older package copy ships `_chain` and `_subscribe` but predates `_retainRef`
function olderCopySource(): CancelablePromise<number> {
  const source = new CancelablePromise<number>(() => {});
  Object.defineProperty(source, '_retainRef', { value: undefined, configurable: true });
  return source;
}

const helpers: Array<[string, (source: CancelablePromise<number>) => CancelablePromise<unknown>]> = [
  ['catchCancel', (source) => catchCancel(source)],
  ['suppressCancel', (source) => suppressCancel(source)],
  ['makeCancelable', (source) => makeCancelable(source)],
];

describe.each(helpers)('%s over a source from an older package copy', (_name, wrap) => {
  it('keeps a shared source alive when the wrapper is canceled', async () => {
    const source = olderCopySource();
    const other = source.then((value) => value);
    const wrapper = wrap(source);

    wrapper.cancel();
    await flushPromises();

    expect(source.isCanceled).toBe(false);
    expect(other.isCanceled).toBe(false);
  });

  it('cancels a source the wrapper was the sole consumer of', async () => {
    const source = olderCopySource();
    const wrapper = wrap(source);
    void wrapper.then(undefined, () => {});

    wrapper.cancel();
    await flushPromises();

    expect(source.isCanceled).toBe(true);
    await expect(source).rejects.toBeInstanceOf(CancelError);
  });
});
