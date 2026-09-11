import { isAbortError, limit } from './index';

// Drain the microtask queue enough times to let a settled job free its slot and the queue be
// pumped, without depending on the exact number of internal microtask hops.
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

/** A job whose start and settlement are each driven by the test. */
interface IJob {
  run(): Promise<string>;
  readonly started: boolean;
  finish(): void;
}

function createJob(name: string): IJob {
  let started = false;
  let settle: (() => void) | undefined;

  return {
    run() {
      started = true;

      return new Promise<string>((resolve) => {
        settle = () => resolve(name);
      });
    },
    get started() {
      return started;
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
      new Promise<void>((resolve) => {
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

    await Promise.all([1, 2, 3, 4, 5, 6].map(() => limited(task)));

    expect(peak).toBe(2);
    expect(limited.active).toBe(0);
    expect(limited.pending).toBe(0);
  });

  it('never starts a queued job dropped by cancel and rejects its handle with an AbortError', async () => {
    const limited = limit(1);
    const running = createJob('running');
    const queued = createJob('queued');

    const first = limited(running.run);
    const second = limited(queued.run);
    const caught = second.catch((reason: unknown) => reason);

    expect(running.started).toBe(true);
    expect(queued.started).toBe(false);
    expect(limited.pending).toBe(1);

    limited.cancel();

    expect(isAbortError(await caught)).toBe(true);
    expect(limited.pending).toBe(0);

    running.finish();
    await first;
    await flushMicrotasks();

    expect(queued.started).toBe(false);
  });

  it('carries the reason on a queued rejection when abandoned', async () => {
    const limited = limit(1);
    const running = createJob('running');
    const queued = createJob('queued');

    const first = limited(running.run);
    const second = limited(queued.run);
    const caught = second.catch((reason: any) => reason);

    limited.cancel('QUEUED-REASON');

    const error = await caught;
    expect(isAbortError(error)).toBe(true);
    expect(error.message).toBe('QUEUED-REASON');
    expect(error.cause).toBe('QUEUED-REASON');

    running.finish();
    await first;
  });

  it('leaves a running job alone on cancel, which a native Promise cannot stop', async () => {
    const limited = limit(1);
    const running = createJob('running');
    const queued = createJob('queued');

    const first = limited(running.run);
    const second = limited(queued.run);
    const caught = second.catch((reason: unknown) => reason);

    limited.cancel();

    expect(isAbortError(await caught)).toBe(true);
    // The slot is still occupied: there is no cancel surface to reach the job through.
    expect(limited.active).toBe(1);

    running.finish();

    await expect(first).resolves.toBe('running');
    await flushMicrotasks();

    expect(limited.active).toBe(0);
    expect(queued.started).toBe(false);

    const next = limited(() => 'after-cancel');
    await expect(next).resolves.toBe('after-cancel');
    expect(limited.active).toBe(0);
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
    await Promise.all(handles);
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

    await Promise.all(handles);
  });

  it('settles every handle it handed out, the queued ones on cancel and the running one on its own', async () => {
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
    await flushMicrotasks();

    // Three queued handles are settled already; the running one waits for its own job.
    expect(settled).toBe(3);

    jobs[0].finish();
    await Promise.all(watched);

    expect(settled).toBe(4);
  });

  it('throws RangeError synchronously for non-integer or invalid concurrency', () => {
    expect(() => limit(0)).toThrow(RangeError);
    expect(() => limit(-1)).toThrow(RangeError);
    expect(() => limit(2.5)).toThrow(RangeError);
    expect(() => limit(NaN)).toThrow(RangeError);

    const limited = limit(2);
    expect(() => {
      limited.concurrency = 0;
    }).toThrow(RangeError);
    expect(() => {
      limited.concurrency = 2.5;
    }).toThrow(RangeError);
    expect(() => {
      limited.concurrency = -1;
    }).toThrow(RangeError);

    expect(() => limit(Infinity)).not.toThrow();
  });

  it('keeps running jobs above the new cap when concurrency is lowered mid-flight', async () => {
    const limited = limit(3);
    const jobs = [createJob('a'), createJob('b'), createJob('c'), createJob('d')];

    const handles = jobs.map((job) => limited(job.run));

    expect(limited.active).toBe(3);
    expect(limited.pending).toBe(1);
    expect(jobs[3].started).toBe(false);

    limited.concurrency = 1;

    expect(limited.concurrency).toBe(1);
    expect(limited.active).toBe(3);
    expect(limited.pending).toBe(1);
    expect(jobs[3].started).toBe(false);

    jobs[0].finish();
    await handles[0];
    await flushMicrotasks();

    expect(limited.active).toBe(2);
    expect(limited.pending).toBe(1);
    expect(jobs[3].started).toBe(false);

    jobs[1].finish();
    await handles[1];
    await flushMicrotasks();

    expect(limited.active).toBe(1);
    expect(limited.pending).toBe(1);
    expect(jobs[3].started).toBe(false);

    jobs[2].finish();
    await handles[2];
    await flushMicrotasks();

    expect(limited.active).toBe(1);
    expect(limited.pending).toBe(0);
    expect(jobs[3].started).toBe(true);

    jobs[3].finish();
    await handles[3];
    await flushMicrotasks();

    expect(limited.active).toBe(0);
  });

  it('pumps a long queue of synchronously settling jobs without overflowing stack depth', async () => {
    const limited = limit(1);
    const total = 10000;
    let releaseFirst: () => void = () => {};
    const first = limited(
      () =>
        new Promise<void>((r) => {
          releaseFirst = r;
        }),
    );
    const rest = Array.from({ length: 10000 }, (_, i) => limited(() => i));

    expect(limited.pending).toBe(10000);
    releaseFirst();
    await first;

    const results = await Promise.all(rest);

    expect(results).toHaveLength(10000);
    expect(results.length).toBe(total);
    expect(results[total - 1]).toBe(total - 1);
    expect(limited.active).toBe(0);
    expect(limited.pending).toBe(0);
  });
});
