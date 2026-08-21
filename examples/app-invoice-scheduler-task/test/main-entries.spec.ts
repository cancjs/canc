// The wiring in main-canc.ts is otherwise exercised end to end by the smoke specs; this file
// covers the one behavior that lives only in the entry itself: the filter is debounced through
// the scheduler-backed timers pair, not the ambient one, and two quick changes leave exactly one
// live query.

import { IPostTaskOptions, ITaskSignal } from '../src/lib/web-scheduler';
import { createFakeScheduler, flushMicrotasks, IFakeScheduler } from './fake-scheduler';

interface IPostRecord {
  priority: string;
  delay: number;
}

interface ISchedulerGlobals {
  scheduler?: unknown;
  TaskController?: unknown;
}

jest.mock('@shared/mock-api', () => {
  const search = jest.fn(async (filter: string) => [
    { id: 'inv-0001', customer: `Customer ${filter}`, total: 10, paid: true, issuedAt: 0 },
  ]);
  const detail = jest.fn();

  return {
    createMockApi: () => ({
      invoices: { search, detail, list: jest.fn(), get: jest.fn() },
      api: { calls: [] },
    }),
    __search: search,
  };
});

const globals = globalThis as ISchedulerGlobals;

beforeEach(() => {
  jest.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
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

describe('main-canc filter debounce', () => {
  it('debounces two quick filter changes into one live run, scheduled through the scheduler pair', async () => {
    const { fake, posts } = installFakeScheduler();

    await import('../src/main-canc');

    // let the initial, unfiltered query settle before touching the filter
    await flushMicrotasks();
    await fake.drain();

    const mockApi = jest.requireMock('@shared/mock-api') as { __search: jest.Mock };
    const search = mockApi.__search;
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');

    const filterInput = document.getElementById('filter') as HTMLInputElement;
    filterInput.value = 'a';
    filterInput.dispatchEvent(new Event('input'));
    filterInput.value = 'ab';
    filterInput.dispatchEvent(new Event('input'));

    // the debounce timer is a scheduler-backed task, at the priority the interaction deserves,
    // never the browser's ambient setTimeout
    expect(posts.some((post) => post.priority === 'user-blocking' && post.delay === 150)).toBe(true);
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    fake.advance(150);
    await fake.drain();

    // the 'a' call was superseded before its timer ever fired: only the latest value ran a query
    expect(search.mock.calls.map((call) => call[0])).toEqual(['', 'ab']);

    const tbody = document.querySelector('#invoices-table tbody');
    expect(tbody?.children.length).toBe(1);

    setTimeoutSpy.mockRestore();
  });
});
