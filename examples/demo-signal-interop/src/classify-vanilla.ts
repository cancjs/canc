/**
 * Scenario 4: Classification — error handling
 * Vanilla: manual .name checks + error context inspection
 */

import { setTimeout } from 'timers/promises';

async function mayFailTask(): Promise<string> {
  await setTimeout(50);
  throw new DOMException('AbortError', 'AbortError');
}

export async function classifyAbortErrorVanilla() {
  try {
    const result = await mayFailTask();
    console.log('[vanilla] result:', result);
  } catch (err: unknown) {
    // Manual check: instanceof + .name
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.log('[vanilla] aborted — keep running');
    } else if (err instanceof Error) {
      console.log('[vanilla] other error:', err.message);
    }
  }
}

export async function suppressAbortVanilla() {
  try {
    const result = await mayFailTask();
    console.log('[vanilla] result:', result);
  } catch (err: unknown) {
    // Manual suppress: check + rethrow logic
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.log('[vanilla] abort suppressed — continuing');
      // Explicitly swallow
    } else if (err instanceof Error) {
      throw err; // Rethrow others
    }
  }
}

export async function suppressMultipleErrorsVanilla() {
  try {
    const result = await mayFailTask();
    console.log('[vanilla] result:', result);
  } catch (err: unknown) {
    // Manual suppress of abort OR cancel
    if (
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.message === 'Canceled')
    ) {
      console.log('[vanilla] abort/cancel suppressed');
    } else {
      throw err;
    }
  }
}
