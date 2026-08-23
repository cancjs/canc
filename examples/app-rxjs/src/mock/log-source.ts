// mock log source with latency-bearing searchContext for RxJS switchMap examples

export interface LogLine {
  seq: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export type SearchStatus = 'started' | 'completed' | 'aborted';

export interface SearchRecord {
  lineSeq: number;
  status: SearchStatus;
}

const TAIL: LogLine[] = [
  { seq: 1, level: 'info', message: 'worker booted' },
  { seq: 2, level: 'warn', message: 'retry queue growing' },
  { seq: 3, level: 'error', message: 'db connection reset' },
  { seq: 4, level: 'info', message: 'reconnected to db' },
  { seq: 5, level: 'error', message: 'request timed out' },
];

const CONTEXT: Record<number, LogLine[]> = {
  3: [
    { seq: 2, level: 'warn', message: 'retry queue growing' },
    { seq: 3, level: 'error', message: 'db connection reset' },
    { seq: 4, level: 'info', message: 'reconnected to db' },
  ],
  5: [
    { seq: 4, level: 'info', message: 'reconnected to db' },
    { seq: 5, level: 'error', message: 'request timed out' },
    { seq: 6, level: 'info', message: 'request retried ok' },
  ],
};

function abortError(): Error {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

/** Structural AbortSignal so this file needs no DOM lib. */
export interface SignalLike {
  readonly aborted: boolean;
  addEventListener?(type: 'abort', listener: () => void): void;
  removeEventListener?(type: 'abort', listener: () => void): void;
}

/** The recent-lines snapshot the tail stream replays on subscribe. */
export function tailLines(): LogLine[] {
  return TAIL.slice();
}

/**
 * Fetch the log lines surrounding one tail line. Latency-bearing and signal-aware: it appends a
 * `started` marker immediately, then either `completed` after the delay or `aborted` the moment
 * the signal fires. The returned record log is how the demo proves what actually happened.
 */
export function searchContext(
  lineSeq: number,
  log: SearchRecord[],
  signal?: SignalLike,
  delayMs = 50,
): Promise<LogLine[]> {
  const started: SearchRecord = { lineSeq, status: 'started' };
  log.push(started);

  return new Promise<LogLine[]>((resolve, reject) => {
    if (signal?.aborted) {
      log.push({ lineSeq, status: 'aborted' });
      reject(abortError());
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      log.push({ lineSeq, status: 'completed' });
      resolve(CONTEXT[lineSeq] ?? []);
    }, delayMs);

    const onAbort = () => {
      clearTimeout(timer);
      log.push({ lineSeq, status: 'aborted' });
      reject(abortError());
    };
    signal?.addEventListener?.('abort', onAbort);
  });
}
