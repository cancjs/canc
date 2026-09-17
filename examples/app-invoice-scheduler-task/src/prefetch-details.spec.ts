import { CancelablePromise, isCancelError, suppressCancel } from '@cancjs/promise';
import { createMockApi, MockApiBundle } from '@shared/mock-api';
import { sleep } from '@shared/util';

import { createFakeScheduler, flushMicrotasks, IFakeScheduler } from '../test/fake-scheduler';
import { IPostTaskOptions, ITaskSignal, postSchedulerTask, toTaskSignal, TTaskPriority } from './lib/web-scheduler';
import {
  PREFETCH_ATTEMPTS,
  PREFETCH_BACKOFF_MS,
  PREFETCH_DELAY_MS,
  prefetchDetails,
  promote,
  trackedPrefetches,
} from './prefetch-details-canc';
import {
  prefetchDetails as prefetchDetailsVanilla,
  promote as promoteVanilla,
  supersedePrefetches,
  trackedPrefetches as trackedPrefetchesVanilla,
} from './prefetch-details-vanilla';

interface ISchedulerGlobals {
  scheduler?: unknown;
  TaskController?: unknown;
}

interface IPostRecord {
  priority: TTaskPriority;
  delay: number;
}

const globals = globalThis as ISchedulerGlobals;
const goodIds: string[] = [];
// An id whose seeded failures run out inside the retry budget, so the prefetch recovers.
let recoveringId = '';
let recoveringFailures = 0;
// An id with more seeded failures than the budget, so the prefetch still gives up.
let exhaustingId = '';

/** How many times this id rejects before it starts resolving, measured on a throwaway api. */
async function countSeededFailures(id: string): Promise<number> {
  const probe = createMockApi({ seedMode: true });
  let failures = 0;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await probe.invoices.detail(id);
      return failures;
    } catch {
      failures += 1;
    }
  }

  return failures;
}

beforeAll(async () => {
  for (let index = 1; index <= 200 && (goodIds.length < 6 || !recoveringId || !exhaustingId); index += 1) {
    const id = `inv-${String(index).padStart(4, '0')}`;
    const failures = await countSeededFailures(id);

    if (failures === 0) {
      if (goodIds.length < 6) goodIds.push(id);
    } else if (failures < PREFETCH_ATTEMPTS) {
      if (!recoveringId) {
        recoveringId = id;
        recoveringFailures = failures;
      }
    } else if (!exhaustingId) {
      exhaustingId = id;
    }
  }

  expect(goodIds).toHaveLength(6);
  expect(recoveringId).not.toBe('');
  expect(exhaustingId).not.toBe('');
});

afterEach(() => {
  delete globals.scheduler;
  delete globals.TaskController;
});

function installFakeScheduler(): { fake: IFakeScheduler; posts: IPostRecord[] } {
  const fake = createFakeScheduler();
  const posts: IPostRecord[] = [];
  const post = fake.impl.scheduler.postTask;

  globals.scheduler = {
    postTask<T>(callback: () => T | PromiseLike<T>, options?: IPostTaskOptions): Promise<T> {
      posts.push({
        priority: options?.priority ?? (options?.signal as ITaskSignal | undefined)?.priority ?? 'user-visible',
        delay: options?.delay ?? 0,
      });

      return post(callback, options);
    },
    yield: fake.impl.scheduler.yield,
  };
  globals.TaskController = fake.impl.TaskController;

  return { fake, posts };
}

/** Stands in for the render run the prefetches belong to: canceling it supersedes them. */
function startRenderRun(): CancelablePromise<void> {
  const run = new CancelablePromise<void>(() => undefined);

  suppressCancel(run);

  return run;
}

function detailCalls(api: MockApiBundle) {
  return api.api.calls.filter((call) => call.endpoint === 'invoices.detail');
}

describe('prefetchDetails, canc flavor', () => {
  it('runs a background prefetch after a user-visible task that was posted later', async () => {
    const { fake } = installFakeScheduler();
    const api = createMockApi({ seedMode: true });
    const lifetime = toTaskSignal(startRenderRun());
    const order: string[] = [];

    const prefetch = prefetchDetails(api.invoices, goodIds[0], lifetime);

    fake.advance(PREFETCH_DELAY_MS);
    postSchedulerTask(() => order.push('user-visible work'), { priority: 'user-visible' });
    fake.runNext();
    await flushMicrotasks();

    expect(order).toEqual(['user-visible work']);
    expect(detailCalls(api)).toHaveLength(0);

    fake.runNext();
    await flushMicrotasks();

    expect(detailCalls(api)).toHaveLength(1);
    await expect(prefetch).resolves.toMatchObject({ id: goodIds[0] });
  });

  it('runs a promoted prefetch ahead of a user-visible task already queued', async () => {
    const { fake } = installFakeScheduler();
    const api = createMockApi({ seedMode: true });
    const lifetime = toTaskSignal(startRenderRun());
    const order: string[] = [];

    const prefetch = prefetchDetails(api.invoices, goodIds[1], lifetime);

    fake.advance(PREFETCH_DELAY_MS);
    postSchedulerTask(() => order.push('user-visible work'), { priority: 'user-visible' });
    promote(prefetch);
    fake.runNext();
    await flushMicrotasks();

    expect(detailCalls(api)).toHaveLength(1);
    expect(order).toEqual([]);
    await expect(prefetch).resolves.toMatchObject({ id: goodIds[1] });
  });

  it('drops every queued prefetch when the render run is superseded', async () => {
    const { fake } = installFakeScheduler();
    const api = createMockApi({ seedMode: true });
    const run = startRenderRun();
    const lifetime = toTaskSignal(run);

    const ids = [goodIds[2], goodIds[3], goodIds[4]];
    const prefetches = ids.map((id) => prefetchDetails(api.invoices, id, lifetime));
    const rejections = prefetches.map((prefetch) => prefetch.catch((reason: unknown) => reason));

    fake.advance(PREFETCH_DELAY_MS);

    expect(fake.queued).toHaveLength(3);

    run.cancel('the filter changed');
    await flushMicrotasks();

    expect(fake.queued).toHaveLength(0);

    await fake.drain();
    await sleep(0);

    expect(detailCalls(api)).toHaveLength(0);

    const reasons = await Promise.all(rejections);

    expect(reasons.every(isCancelError)).toBe(true);
  });

  it('aborts the request a running prefetch is waiting on when the render run is superseded', async () => {
    const { fake } = installFakeScheduler();
    const api = createMockApi({ latency: 40, jitter: 0 });
    const run = startRenderRun();
    const lifetime = toTaskSignal(run);

    const prefetch = prefetchDetails(api.invoices, goodIds[5], lifetime);
    const rejection = prefetch.catch((reason: unknown) => reason);

    fake.advance(PREFETCH_DELAY_MS);
    fake.runNext();
    await flushMicrotasks();

    expect(detailCalls(api)[0].status).toBe('started');

    run.cancel('the filter changed');
    await flushMicrotasks();

    expect(detailCalls(api)[0].status).toBe('aborted');
    expect(isCancelError(await rejection)).toBe(true);
  });

  /** Lets the initial background task and `backoffs` retry waits run, each on the fake scheduler. */
  async function runPrefetchWithBackoffs(fake: IFakeScheduler, backoffs: number): Promise<void> {
    fake.advance(PREFETCH_DELAY_MS);
    await fake.drain();
    await sleep(0);

    for (let backoff = 0; backoff < backoffs; backoff += 1) {
      fake.advance(PREFETCH_BACKOFF_MS * Math.pow(2, backoff));
      await fake.drain();
      await sleep(0);
      await flushMicrotasks();
    }
  }

  it('waits out every retry backoff as a background task', async () => {
    const { fake, posts } = installFakeScheduler();
    const api = createMockApi({ seedMode: true });
    const lifetime = toTaskSignal(startRenderRun());
    const retried: number[] = [];

    const prefetch = prefetchDetails(api.invoices, exhaustingId, lifetime, {
      onRetry: (attempt) => retried.push(attempt),
    });
    const rejection = prefetch.catch((reason: unknown) => reason);

    await runPrefetchWithBackoffs(fake, PREFETCH_ATTEMPTS - 1);

    expect(detailCalls(api)).toHaveLength(PREFETCH_ATTEMPTS);
    expect(retried).toEqual([1, 2]);
    expect(posts).toEqual([
      { priority: 'background', delay: PREFETCH_DELAY_MS },
      { priority: 'background', delay: PREFETCH_BACKOFF_MS },
      { priority: 'background', delay: PREFETCH_BACKOFF_MS * 2 },
    ]);
    expect(((await rejection) as Error).message).toContain('temporarily unavailable');
  });

  it('resolves once an id stops failing, so a retry has a recovery to show', async () => {
    const { fake, posts } = installFakeScheduler();
    const api = createMockApi({ seedMode: true });
    const lifetime = toTaskSignal(startRenderRun());
    const retried: number[] = [];

    const prefetch = prefetchDetails(api.invoices, recoveringId, lifetime, {
      onRetry: (attempt) => retried.push(attempt),
    });

    await runPrefetchWithBackoffs(fake, recoveringFailures);

    expect(detailCalls(api)).toHaveLength(recoveringFailures + 1);
    expect(retried).toHaveLength(recoveringFailures);
    expect(posts.every((post) => post.priority === 'background')).toBe(true);
    await expect(prefetch).resolves.toMatchObject({ id: recoveringId });
  });

  it('tracks nothing once every prefetch has settled', async () => {
    const { fake } = installFakeScheduler();
    const api = createMockApi({ seedMode: true });
    const run = startRenderRun();
    const lifetime = toTaskSignal(run);

    const completed = prefetchDetails(api.invoices, goodIds[0], lifetime);
    const superseded = prefetchDetails(api.invoices, goodIds[1], lifetime);
    const rejection = superseded.catch((reason: unknown) => reason);

    expect(trackedPrefetches.size).toBe(2);

    fake.advance(PREFETCH_DELAY_MS);
    fake.runNext();
    await flushMicrotasks();
    await completed;

    run.cancel('the filter changed');
    await rejection;
    await flushMicrotasks();

    expect(trackedPrefetches.size).toBe(0);
  });
});

describe('prefetchDetails, vanilla flavor', () => {
  it('runs a promoted prefetch first, so the comparison is fair', async () => {
    const { fake } = installFakeScheduler();
    const api = createMockApi({ seedMode: true });
    const order: string[] = [];

    const prefetch = prefetchDetailsVanilla(api.invoices, goodIds[0]);

    fake.advance(PREFETCH_DELAY_MS);
    postSchedulerTask(() => order.push('user-visible work'), { priority: 'user-visible' });
    promoteVanilla(prefetch);
    fake.runNext();
    await flushMicrotasks();

    expect(detailCalls(api)).toHaveLength(1);
    expect(order).toEqual([]);
    await expect(prefetch.promise).resolves.toMatchObject({ id: goodIds[0] });
  });

  it('aborts a running prefetch when the registry is swept', async () => {
    const { fake } = installFakeScheduler();
    const api = createMockApi({ latency: 40, jitter: 0 });

    const prefetch = prefetchDetailsVanilla(api.invoices, goodIds[1]);
    const rejection = prefetch.promise.catch((reason: unknown) => reason);

    fake.advance(PREFETCH_DELAY_MS);
    fake.runNext();
    await flushMicrotasks();

    expect(detailCalls(api)[0].status).toBe('started');

    supersedePrefetches('the filter changed');
    await rejection;

    expect(detailCalls(api)[0].status).toBe('aborted');
    expect(trackedPrefetchesVanilla.size).toBe(0);
  });
});
