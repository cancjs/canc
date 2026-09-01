import { isObject } from '../../../_util/guards';
import { ProcessSignalError, ProcessSpawnError } from '../errors/classes';

interface IChildProcessError {
  code?: string | number | null;
  signal?: string | null;
  syscall?: string;
  cmd?: string;
  message?: string;
}

/**
 * Maps the two child process failures node reports ambiguously to typed errors, and passes
 * everything else through untouched.
 *
 * A failed spawn and a command that could not find its own input both report `ENOENT`, and a
 * process killed by a signal reports no exit code at all. Every other failure keeps node's own
 * error, including the decorated non-zero exit error and `AbortError`.
 *
 * @param err The error node reported.
 * @param command The command that was run, used when node did not record one.
 * @returns A typed error for a spawn or signal failure, otherwise the original error.
 */
export function mapChildProcessError(err: unknown, command?: string): unknown {
  if (!isObject(err)) {
    return err;
  }

  const error = err as IChildProcessError;
  const cmd = error.cmd ?? command;

  if (
    typeof error.code === 'string' &&
    (error.syscall?.startsWith('spawn') ||
      error.code === 'ENOENT' ||
      error.code === 'EACCES' ||
      error.code === 'EMFILE' ||
      error.code === 'ENOTDIR' ||
      error.code === 'E2BIG')
  ) {
    return new ProcessSpawnError(error.message, { code: error.code, command: cmd, cause: err });
  }

  if (error.signal && !error.code) {
    return new ProcessSignalError(error.message, { signal: error.signal, command: cmd, cause: err });
  }

  return err;
}
