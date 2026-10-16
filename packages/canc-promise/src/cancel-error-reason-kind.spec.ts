import { AbortError, TimeoutError } from '../../_util';
import { CancelError } from './cancel-error';

function renamed<T extends Error>(error: T): T {
  Object.defineProperty(error, 'name', { value: 'X' });
  return error;
}

describe('CancelError aborted and timedOut', () => {
  it('reads a renamed branded TimeoutError cause as timedOut', () => {
    const error = new CancelError('', { cause: renamed(new TimeoutError()) });

    expect(error.timedOut).toBe(true);
    expect(error.aborted).toBe(false);
  });

  it('reads a renamed branded AbortError cause as aborted', () => {
    const error = new CancelError('', { cause: renamed(new AbortError()) });

    expect(error.aborted).toBe(true);
    expect(error.timedOut).toBe(false);
  });

  it('answers false for a cause whose name getter throws', () => {
    const cause = {
      get name(): string {
        throw new Error('hostile');
      },
    };
    const error = new CancelError('', { cause });

    expect(error.aborted).toBe(false);
    expect(error.timedOut).toBe(false);
  });

  it('keeps the platform AbortSignal.timeout reason as timedOut', async () => {
    const signal = AbortSignal.timeout(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const error = new CancelError('', { cause: signal.reason });

    expect(error.timedOut).toBe(true);
    expect(error.aborted).toBe(false);
  });
});
