import { ChildProcess } from 'node:child_process';

import { CancelablePromise, ICancelablePromiseOptions } from '@cancjs/promise';

import { killLadder } from './kill';

export interface IKillTreeOptions extends ICancelablePromiseOptions {
  /** Signal sent to initiate termination on POSIX. Defaults to 'SIGTERM'. */
  killSignal?: string | number;
  /** Milliseconds to wait before escalating to SIGKILL. Defaults to 5000 ms. */
  gracePeriod?: number;
}

/**
 * Terminate a child process and all of its descendants.
 *
 * On POSIX systems, sending signals to the entire process tree requires signaling
 * the process group via `process.kill(-pid, signal)`. For the group to exist and be
 * distinct from the caller process, the child must have been spawned with `detached: true`.
 *
 * On Windows systems, this invokes `taskkill /pid <pid> /t /f` to terminate the tree.
 *
 * @param child The child process to terminate.
 * @param options Optional configuration for termination signal and escalation grace period.
 * @returns A cancelable promise that resolves when the process tree has terminated.
 */
export function killTree(child: ChildProcess, options?: IKillTreeOptions): CancelablePromise<void> {
  return new CancelablePromise<void>((resolve, reject) => {
    killLadder(child, { ...options, killTree: true }).then(resolve, reject);
  }, options);
}
