import { ChildProcess, exec } from 'node:child_process';
import { platform } from 'node:os';

export interface IKillLadderOptions {
  killSignal?: string | number;
  gracePeriod?: number;
  killTree?: boolean;
}

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

    // Use a reference object to hold the timers so we can use const
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
        child.kill(killSignal as NodeJS.Signals);
      }
    } catch {
      // Ignore if already dead
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
        // Ignore
      }
    }, gracePeriod);
    if (timers.escalate.unref) timers.escalate.unref();
  });
}
