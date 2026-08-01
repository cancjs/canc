/**
 * Minimal structural signal so this utility does not depend on DOM lib types.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
  reason?: unknown;
  addEventListener?: (type: 'abort', listener: () => void) => void;
  removeEventListener?: (type: 'abort', listener: () => void) => void;
  // Widened so a native AbortSignal (whose onabort is typed with `this: AbortSignal`) is
  // structurally assignable to this shape.
  onabort?: ((...args: any[]) => any) | null;
}

/**
 * Attaches an abort listener across native signals and legacy onabort-only polyfills.
 * Returns a detach function (or undefined when there is nothing to detach).
 *
 * @param signal - Signal-like object to listen to
 * @param onAbort - Callback when abort fires
 * @returns Function to remove the listener, or undefined if no listener was attached
 */
export function attachAbort(signal: AbortSignalLike | undefined, onAbort: () => void): (() => void) | undefined {
  if (!signal) return undefined;
  if (typeof signal.addEventListener === 'function') {
    signal.addEventListener('abort', onAbort);
    return () => signal.removeEventListener?.('abort', onAbort);
  }
  if ('onabort' in signal) {
    const previous = signal.onabort;
    signal.onabort = function (this: unknown, ev: unknown) {
      onAbort();
      if (typeof previous === 'function') previous.call(this, ev);
    };
    return () => {
      signal.onabort = previous ?? null;
    };
  }
  return undefined;
}
