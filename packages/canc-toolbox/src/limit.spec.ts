import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { limit } from './index';

// Drain the microtask queue enough times to let a canceled job's chain settle and the freed slot be
// pumped, without depending on the exact number of internal microtask hops.
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

/** A job whose start, cancellation and settlement are each driven by the test. */
interface IJob {
  run(): CancelablePromise<string>;
  readonly started: boolean;
  readonly canceled: boolean;
  finish(): void;
}

function createJob(name: string): IJob {
  let started = false;
  let canceled = false;
  let settle: (() => void) | undefined;

  return {
    run() {
      started = true;

      return new CancelablePromise<string>((resolve, reject, { handleCancel }) => {
        settle = () => resolve(name);
        handleCancel(() => {
          canceled = true;
        });
      });
    },
    get started() {
      return started;
    },
    get canceled() {
      return canceled;
    },
    finish() {
      if (settle) settle();
    },
  };
}

describe('limit', () => {
  it('runs no more jobs at once than the configured concurrency', async () => {
    const limited = limit(2);
    let current = 0;
    let peak = 0;

    const task = () =>
      new CancelablePromise<void>((resolve) => {
        current++;
        peak = Math.max(peak, current);

        // A couple of microtask hops, so any overlapping start would show up in `peak`.
        Promise.resolve()
          .then(() => Promise.resolve())
          .then(() => {
            current--;
            resolve();
          });
      });

    await CancelablePromise.all([1, 2, 3, 4, 5, 6].map(() => limited(task)));

    expect(peak).toBe(2);
    expect(limited.active).toBe(0);
    expect(limited.pending).toBe(0);
  });

  it('never starts a job canceled while queued and rejects its handle with a CancelError', async () => {
    const limited = limit(1);
    const running = createJob('running');
    const queued = createJob('queued');

    const first = limited(running.run);
    const second = limited(queued.run);
    const caught = second.catch((reason: unknown) => reason);

    expect(running.started).toBe(true);
    expect(queued.started).toBe(false);
    expect(limited.pending).toBe(1);

    second.cancel();

    expect(isCancelError(await caught)).toBe(true);
    expect(limited.pending).toBe(0);

    running.finish();
    await first;
    await flushMicrotasks();

    expect(queued.started).toBe(false);
  });

  it('cancels the underlying job when a running handle is canceled', async () => {
    const limited = limit(1);
    const job = createJob('job');

    const handle = limited(job.run);
    const caught = handle.catch((reason: unknown) => reason);

    expect(job.started).toBe(true);

    handle.cancel();

    expect(job.canceled).toBe(true);
    expect(isCancelError(await caught)).toBe(true);

    await flushMicrotasks();

    expect(limited.active).toBe(0);
  });

  it('drops the queue and cancels running jobs on cancel', async () => {
    const limited = limit(1);
    const running = createJob('running');
    const queuedFirst = createJob('queued-first');
    const queuedSecond = createJob('queued-second');

    const handles = [limited(running.run), limited(queuedFirst.run), limited(queuedSecond.run)];
    const caught = handles.map((handle) => handle.catch((reason: unknown) => reason));

    expect(limited.active).toBe(1);
    expect(limited.pending).toBe(2);

    limited.cancel();

    const reasons = await CancelablePromise.all(caught);

    expect(reasons.map((reason) => isCancelError(reason))).toEqual([true, true, true]);
    expect(running.canceled).toBe(true);
    expect(queuedFirst.started).toBe(false);
    expect(queuedSecond.started).toBe(false);

    await flushMicrotasks();

    expect(limited.active).toBe(0);
    expect(limited.pending).toBe(0);
  });

  it('tracks active and pending across a scripted sequence', async () => {
    const limited = limit(2);
    const jobs = [createJob('a'), createJob('b'), createJob('c'), createJob('d')];

    expect(limited.active).toBe(0);
    expect(limited.pending).toBe(0);

    const handles = jobs.map((job) => limited(job.run));

    expect(limited.active).toBe(2);
    expect(limited.pending).toBe(2);
    expect(jobs[2].started).toBe(false);

    jobs[0].finish();
    await handles[0];
    await flushMicrotasks();

    expect(limited.active).toBe(2);
    expect(limited.pending).toBe(1);
    expect(jobs[2].started).toBe(true);
    expect(jobs[3].started).toBe(false);

    jobs[1].finish();
    await handles[1];
    await flushMicrotasks();

    expect(limited.active).toBe(2);
    expect(limited.pending).toBe(0);
    expect(jobs[3].started).toBe(true);

    jobs[2].finish();
    jobs[3].finish();
    await CancelablePromise.all(handles);
    await flushMicrotasks();

    expect(limited.active).toBe(0);
  });

  it('drains the queue as soon as concurrency is raised', async () => {
    const limited = limit(1);
    const jobs = [createJob('a'), createJob('b'), createJob('c')];

    const handles = jobs.map((job) => limited(job.run));

    expect(limited.active).toBe(1);
    expect(limited.pending).toBe(2);

    limited.concurrency = 3;

    expect(limited.concurrency).toBe(3);
    expect(limited.active).toBe(3);
    expect(limited.pending).toBe(0);
    expect(jobs[1].started).toBe(true);
    expect(jobs[2].started).toBe(true);

    for (const job of jobs) job.finish();

    await CancelablePromise.all(handles);
  });

  it('settles every handle it handed out when canceled', async () => {
    const limited = limit(1);
    const jobs = [createJob('a'), createJob('b'), createJob('c'), createJob('d')];
    let settled = 0;

    const handles = jobs.map((job) => limited(job.run));
    const watched = handles.map((handle) =>
      handle.then(
        () => {
          settled++;
        },
        () => {
          settled++;
        },
      ),
    );

    limited.cancel();

    await CancelablePromise.all(watched);

    expect(settled).toBe(4);
  });
});
