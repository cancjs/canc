// End to end through the vanilla entry, mirroring smoke-canc.spec.ts. Two contrasts: the naive
// renderer keeps painting a stale filter's rows no matter what fires mid-loop (the bug this whole
// example exists to teach), and the scheduled renderer main-vanilla.ts actually wires up stops.

import { renderInvoices as renderInvoicesNaive } from '../src/render-table-vanilla';
import { IInvoiceRow } from '../src/table-shared';
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

  return {
    ...actual,
    createMockApi: (options?: Record<string, unknown>) => actual.createMockApi({ ...(options ?? {}), seedMode: true }),
  };
});

function installFakeScheduler(): { fake: IFakeScheduler } {
  const fake = createFakeScheduler();

  globals.scheduler = fake.impl.scheduler;
  globals.TaskController = fake.impl.TaskController;

  return { fake };
}

/** Drains the fake scheduler, flushes microtasks, and lets the mock api's fake-timed 0ms latency run. */
async function settle(fake: IFakeScheduler, rounds = 8): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await fake.drain();
    await flushMicrotasks();
    await jest.advanceTimersByTimeAsync(0);
  }
}

function makeRows(count: number): IInvoiceRow[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `inv-${String(index + 1).padStart(4, '0')}`,
    customer: `Customer ${index % 40}`,
    total: 100 + index,
    paid: index % 3 === 0,
  }));
}

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  document.body.innerHTML = '<div id="app"></div>';
  clock = 0;
  // every reading jumps a whole frame budget, so the render yields once per chunk deterministically
  performance.now = (): number => (clock += 1000);
});

afterEach(() => {
  jest.useRealTimers();
  performance.now = realNow;
  delete globals.scheduler;
  delete globals.TaskController;
});

describe('app-invoice-scheduler-task smoke, vanilla flavor', () => {
  it('the naive renderer keeps painting the stale filter rows even after its signal aborts mid-loop', () => {
    const rows = makeRows(300);
    const tbody = document.createElement('table').appendChild(document.createElement('tbody'));
    const controller = new AbortController();

    // a filter change firing here is exactly the "stale rows never stop" bug the example teaches:
    // nothing can flip the flag while the loop holds the thread
    const observer = new MutationObserver(() => controller.abort('the filter changed'));

    observer.observe(tbody, { childList: true });

    renderInvoicesNaive(tbody, rows, controller.signal);

    expect(controller.signal.aborted).toBe(false);
    expect(tbody.rows.length).toBe(rows.length);

    observer.disconnect();
  });

  it('a filter change mid-render stops the scheduled renderer main-vanilla.ts actually wires up', async () => {
    const { fake } = installFakeScheduler();

    await import('../src/main-vanilla');

    // let the initial search resolve through its own fake-timed 0ms latency
    await jest.advanceTimersByTimeAsync(0);
    await flushMicrotasks();

    // first screenful, then one more chunk: still genuinely in flight from here
    fake.runNext();
    await flushMicrotasks();
    fake.runNext();
    await flushMicrotasks();

    const tbody = document.querySelector('#invoices-table tbody') as HTMLTableSectionElement;
    const rowsMidRender = tbody.children.length;

    expect(rowsMidRender).toBeGreaterThan(25);
    expect(rowsMidRender).toBeLessThan(5000);

    const filterInput = document.getElementById('filter') as HTMLInputElement;
    filterInput.value = 'zzzznomatch';
    filterInput.dispatchEvent(new Event('input'));

    // the hand-rolled debounce is a real ambient timer, unlike the scheduler-backed one in main-canc.ts
    await jest.advanceTimersByTimeAsync(150);
    await flushMicrotasks();
    await settle(fake);

    // no rows survived from the stopped run, and the new filter matched nothing
    expect(tbody.children.length).toBe(0);
  });
});
