import { ChildProcess, exec } from 'node:child_process';
import { platform } from 'node:os';

export interface IKillLadderOptions {
  killSignal?: NodeJS.Signals | number;
  gracePeriod?: number;
  killTree?: boolean;
}

/**
 * Terminate a child process, escalating if it does not exit within the grace period.
 *
 * Resolves when the child is gone or when the hard timeout expires, and never rejects, so a
 * cancellation that waits on it cannot hang. The result is a plain promise on purpose: this is a
 * teardown primitive, and a kill that could itself be canceled would leave the child alive.
 *
 * @param child The child process to terminate.
 * @param opts Termination signal, escalation grace period, and whether to kill the whole tree.
 * @returns A promise that resolves once termination has been observed or the hard timeout expires.
 */
export function killLadder(child: ChildProcess, opts?: IKillLadderOptions): Promise<void> {
  const killSignal = opts?.killSignal ?? 'SIGTERM';
  const gracePeriod = opts?.gracePeriod ?? 5000;
  const killTree = opts?.killTree ?? false;
  const isWindows = platform() === 'win32';

  return new Promise<void>((resolve) => {
    const pid = child.pid;
    if (pid === undefined || child.killed || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    let resolved = false;

    const timers: { fallback?: NodeJS.Timeout; escalate?: NodeJS.Timeout } = {};

    function done() {
      if (resolved) return;
      resolved = true;
      if (timers.escalate) clearTimeout(timers.escalate);
      if (timers.fallback) clearTimeout(timers.fallback);
      resolve();
    }

    child.once('exit', done);

    // Hard timeout so await p.cancel() cannot hang forever
    timers.fallback = setTimeout(done, gracePeriod + 5000);
    if (timers.fallback.unref) timers.fallback.unref();

    try {
      if (killTree) {
        if (isWindows) {
          // Windows has no POSIX signals. taskkill /t /f spawns another process, is async,
          // and fails with ERROR_NOT_FOUND if the child already exited. Treat that failure as success.
          exec(`taskkill /pid ${pid} /t /f`, () => {});
        } else {
          // Group kill needs detached: true at spawn time plus process.kill(-pid, sig).
          process.kill(-pid, killSignal);
        }
      } else {
        // POSIX child.kill() signals the direct child only. exec always runs through a shell,
        // so the shell dies and the real workload survives as an orphan.
        child.kill(killSignal);
      }
    } catch {
      // The child can exit between the liveness check above and the signal, and a kill that lost
      // that race has already achieved what it was asked to do
    }

    timers.escalate = setTimeout(() => {
      if (resolved) return;
      try {
        if (isWindows) {
          exec(`taskkill /pid ${pid} /t /f`, () => {});
        } else {
          if (killTree) {
            process.kill(-pid, 'SIGKILL');
          } else {
            child.kill('SIGKILL');
          }
        }
      } catch {
        // Same race as the first signal: an exit during the grace period is the desired outcome
      }
    }, gracePeriod);
    if (timers.escalate.unref) timers.escalate.unref();
  });
}
