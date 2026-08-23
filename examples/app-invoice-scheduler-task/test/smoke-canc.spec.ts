// end-to-end smoke test through canc entry with fake scheduler

import { createFakeScheduler, flushMicrotasks, IFakeScheduler } from './fake-scheduler';

interface ISchedulerGlobals {
  scheduler?: unknown;
  TaskController?: unknown;
}

const globals = globalThis as ISchedulerGlobals;
const realNow = performance.now;
let clock = 0;

jest.mock('@shared/mock-api', () => {
  const actual = jest.requireActual('@shared/mock-api');
  let detailCalls: string[] = [];

  const wrappedCreateMockApi = (options?: Record<string, unknown>) => {
    detailCalls = [];
    const bundle = actual.createMockApi({ ...(options ?? {}), seedMode: true });
    const realDetail = bundle.invoices.detail.bind(bundle.invoices);

    bundle.invoices.detail = (id: string, signal?: unknown) => {
      detailCalls.push(id);

      return realDetail(id, signal);
    };

    return bundle;
  };

  return {
    ...actual,
    createMockApi: wrappedCreateMockApi,
    __detailCalls: (): string[] => detailCalls,
  };
});

// jsdom has no IntersectionObserver at all, so main-canc.ts's own guard would skip the prefetch
// wiring entirely; this stub is just enough to let a test flip a row's visibility by hand
class StubIntersectionObserver {
  static instances: StubIntersectionObserver[] = [];
  private readonly callback: (entries: Array<{ isIntersecting: boolean; target: Element }>) => void;

  constructor(callback: (entries: Array<{ isIntersecting: boolean; target: Element }>) => void) {
    this.callback = callback;
    StubIntersectionObserver.instances.push(this);
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}

  trigger(target: Element): void {
    this.callback([{ isIntersecting: true, target }]);
  }
}

function installFakeScheduler(): { fake: IFakeScheduler } {
  const fake = createFakeScheduler();

  globals.scheduler = fake.impl.scheduler;
  globals.TaskController = fake.impl.TaskController;

  return { fake };
}

/** Drains the fake scheduler, flushes microtasks, and lets the mock api's real 0ms latency tick. */
async function settle(fake: IFakeScheduler, rounds = 8): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await fake.drain();
    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  jest.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  StubIntersectionObserver.instances = [];
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = StubIntersectionObserver;
  clock = 0;
  // every reading jumps a whole frame budget, so the render yields once per chunk deterministically
  performance.now = (): number => (clock += 1000);
});

afterEach(() => {
  performance.now = realNow;
  delete globals.scheduler;
  delete globals.TaskController;
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
});

describe('app-invoice-scheduler-task smoke, canc flavor', () => {
  it('a filter change mid-render cancels the run and its queued prefetches, no unhandled rejection', async () => {
    const { fake } = installFakeScheduler();
    const unhandled = jest.fn();

    process.on('unhandledRejection', unhandled);

    try {
      await import('../src/main-canc');

      // let the initial search resolve, which needs a real tick for the mock api's own setTimeout
      for (let round = 0; round < 6; round += 1) {
        await flushMicrotasks();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // first screenful, then one more chunk: the render is still genuinely in flight from here
      fake.runNext();
      await flushMicrotasks();
      fake.runNext();
      await flushMicrotasks();

      const tbody = document.querySelector('#invoices-table tbody') as HTMLTableSectionElement;
      const rowsMidRender = tbody.children.length;

      expect(rowsMidRender).toBeGreaterThan(25);
      expect(rowsMidRender).toBeLessThan(5000);

      const farObserver = StubIntersectionObserver.instances[0];

      expect(farObserver).toBeDefined();

      const watchedRow = tbody.rows[0];
      const prefetchedId = watchedRow.cells[0].textContent;

      farObserver.trigger(watchedRow);
      await flushMicrotasks();

      const { trackedPrefetches } = await import('../src/prefetch-details-canc');

      expect(trackedPrefetches.size).toBe(1);

      const filterInput = document.getElementById('filter') as HTMLInputElement;
      filterInput.value = 'zzzznomatch';
      filterInput.dispatchEvent(new Event('input'));

      fake.advance(150);
      await settle(fake);

      // no rows survived from the canceled run, and the new filter matched nothing
      expect(tbody.children.length).toBe(0);
      // the queued prefetch was dropped, never ran
      expect(trackedPrefetches.size).toBe(0);

      const mockApiModule = jest.requireMock('@shared/mock-api') as { __detailCalls: () => string[] };

      expect(mockApiModule.__detailCalls()).not.toContain(prefetchedId);

      // one real turn of the event loop is what node needs before flagging a rejection unhandled
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
