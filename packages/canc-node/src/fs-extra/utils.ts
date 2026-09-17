/**
 * Shape of an abort signal provided by cancelable-promise or the platform.
 */
export interface IAbortSignalLike {
  readonly aborted: boolean;
  readonly reason?: unknown;
}

/**
 * Throws the signal reason if the signal has been aborted.
 *
 * @param signal - Abort signal to check.
 */
export function throwIfAborted(signal: IAbortSignalLike): void {
  if (signal.aborted) {
    throw signal.reason;
  }
}
