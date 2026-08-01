/**
 * Scenario 3: Composition — AbortSignal.timeout + manual signal + canc
 * Vanilla: manual any() + listener cleanup bookkeeping — bloat highlighted
 */

import { setTimeout } from 'timers/promises';

async function slowerFetch(): Promise<string> {
  await setTimeout(500);
  return 'fetched data';
}

export async function composeTimeoutAndSignalVanilla() {
  const userController = new AbortController();
  const userSignal = userController.signal;

  // Manual timeout composition: AbortSignal.timeout + user signal + race
  const timeoutSignal = AbortSignal.timeout(200);

  let abortListener: EventListener | null = null;
  let timeoutListener: EventListener | null = null;

  try {
    // Manual any(): need Promise.race + manual listeners + cleanup
    const anyAborted = new Promise<void>((_, reject) => {
      abortListener = () => reject(new DOMException('AbortError', 'AbortError'));
      timeoutListener = () => reject(new DOMException('TimeoutError', 'AbortError'));

      userSignal.addEventListener('abort', abortListener);
      timeoutSignal.addEventListener('abort', timeoutListener);
    });

    const work = slowerFetch().catch((err) => Promise.reject(err));

    const result = await Promise.race([anyAborted, work]);
    console.log('[vanilla] result:', result);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.log('[vanilla] timeout or user abort');
      // keeps running after rejection — wasted work
    } else {
      throw err;
    }
  } finally {
    // Cleanup listeners (bloat point)
    if (abortListener) userSignal.removeEventListener('abort', abortListener);
    if (timeoutListener) timeoutSignal.removeEventListener('abort', timeoutListener);
  }
}

export async function composeMultipleSignalsVanilla() {
  const userController = new AbortController();
  const timeoutController = new AbortController();

  const signals = [userController.signal, timeoutController.signal];

  // Manual any() with cleanup
  const cleanup: Array<{ signal: AbortSignal; listener: EventListener }> = [];

  try {
    const anyAborted = new Promise<void>((_, reject) => {
      signals.forEach((signal) => {
        const listener = () => reject(new DOMException('AbortError', 'AbortError'));
        signal.addEventListener('abort', listener);
        cleanup.push({ signal, listener });
      });
    });

    const work = slowerFetch();

    const result = await Promise.race([anyAborted, work]);
    console.log('[vanilla] result:', result);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.log('[vanilla] one of the signals aborted');
    } else {
      throw err;
    }
  } finally {
    // Cleanup all listeners (bloat)
    cleanup.forEach(({ signal, listener }) => {
      signal.removeEventListener('abort', listener);
    });
  }
}
