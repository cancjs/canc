import { isCancelError } from '@cancjs/promise';

import { createFakeScheduler, flushMicrotasks, IFakeScheduler } from '../test/fake-scheduler';
import { postSchedulerTask } from './lib/web-scheduler';
import { DEFAULT_CHUNK_SIZE, FIRST_SCREENFUL, renderInvoices as renderInvoicesCanc } from './render-table-canc';
import { renderInvoices as renderInvoicesVanilla, renderInvoicesScheduled } from './render-table-vanilla';
import { IInvoiceRow } from './table-shared';

const TOTAL_INVOICES = 5000;

interface ISchedulerGlobals {
  scheduler?: unknown;
  TaskController?: unknown;
}

const globals = globalThis as ISchedulerGlobals;
const realNow = performance.now;
let clock = 0;

beforeEach(() => {
  clock = 0;
  // every reading jumps a whole frame budget, so the render yields once per chunk and the tests
  // never wait on a real clock
  performance.now = (): number => (clock += 1000);
});

afterEach(() => {
  performance.now = realNow;
  delete globals.scheduler;
  delete globals.TaskController;
});

function installFakeScheduler(): { fake: IFakeScheduler; yields: jest.Mock } {
  const fake = createFakeScheduler();
  const yields = jest.fn(() => fake.impl.scheduler.yield?.() ?? Promise.resolve());

  globals.scheduler = { postTask: fake.impl.scheduler.postTask, yield: yields };
  globals.TaskController = fake.impl.TaskController;

  return { fake, yields };
}

function createInvoices(count: number): IInvoiceRow[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `inv-${String(index + 1).padStart(4, '0')}`,
    customer: `Customer ${index % 40}`,
    total: 100 + index,
    paid: index % 3 === 0,
  }));
}

function createTbody(): HTMLTableSectionElement {
  const table = document.createElement('table');

  return table.appendChild(document.createElement('tbody'));
}

describe('renderInvoices, canc flavor', () => {
  it('paints the first screenful from a user-blocking task before any user-visible work', async () => {
    const { fake } = installFakeScheduler();
    const tbody = createTbody();
    const order: string[] = [];

    const competing = postSchedulerTask(() => order.push('competing chunk'), { priority: 'user-visible' });
    const render = renderInvoicesCanc(tbody, createInvoices(TOTAL_INVOICES));

    expect(fake.queued.map((task) => task.priority)).toEqual(['user-blocking', 'user-visible']);

    fake.runNext();

    expect(tbody.rows.length).toBe(FIRST_SCREENFUL);
    expect(order).toEqual([]);

    await fake.drain();
    await Promise.all([render, competing]);

    expect(tbody.rows.length).toBe(TOTAL_INVOICES);
    expect(order).toEqual(['competing chunk']);
  });

  it('stops growing and runs its cleanup when the render is canceled', async () => {
    const { fake } = installFakeScheduler();
    const tbody = createTbody();

    const render = renderInvoicesCanc(tbody, createInvoices(TOTAL_INVOICES));
    const rejection = render.catch((reason: unknown) => reason);

    fake.runNext();
    await flushMicrotasks();

    const rowsAtCancel = tbody.rows.length;
    render.cancel('the filter changed');
    await rejection;

    expect(tbody.dataset.rendering).toBeUndefined();

    await fake.drain();
    await fake.drain();

    expect(rowsAtCancel).toBeGreaterThan(FIRST_SCREENFUL);
    expect(tbody.rows.length).toBe(rowsAtCancel);
  });

  it('rejects a canceled render with a cancel error', async () => {
    const { fake } = installFakeScheduler();
    const tbody = createTbody();

    const render = renderInvoicesCanc(tbody, createInvoices(TOTAL_INVOICES));
    const rejection = render.catch((reason: unknown) => reason);

    fake.runNext();
    await flushMicrotasks();
    render.cancel('the filter changed');

    const reason = await rejection;

    expect(isCancelError(reason)).toBe(true);
    expect((reason as Error).message).toContain('the filter changed');
  });

  it('yields once per chunk rather than once per row', async () => {
    const { fake, yields } = installFakeScheduler();
    const tbody = createTbody();
    const chunkSize = 500;

    const render = renderInvoicesCanc(tbody, createInvoices(TOTAL_INVOICES), { chunkSize });

    await fake.drain();
    await render;

    expect(tbody.rows.length).toBe(TOTAL_INVOICES);
    expect(yields).toHaveBeenCalledTimes(Math.ceil((TOTAL_INVOICES - FIRST_SCREENFUL) / chunkSize));
  });

  it('lands the whole chunk that was running when the cancel arrived, and no more', async () => {
    const { fake } = installFakeScheduler();
    const tbody = createTbody();
    const invoices = createInvoices(TOTAL_INVOICES);
    const boundary = FIRST_SCREENFUL + 2 * DEFAULT_CHUNK_SIZE;
    const takeSlice = invoices.slice.bind(invoices);
    const pending: { render?: ReturnType<typeof renderInvoicesCanc> } = {};
    let sliceCount = 0;

    // the third slice builds the second chunk of the loop, so the cancel arrives while that chunk
    // is being appended and nothing can interrupt it
    invoices.slice = (start?: number, end?: number): IInvoiceRow[] => {
      sliceCount += 1;

      if (sliceCount === 3) {
        pending.render?.cancel('the filter changed');
      }

      return takeSlice(start, end);
    };

    pending.render = renderInvoicesCanc(tbody, invoices, { chunkSize: DEFAULT_CHUNK_SIZE });
    const rejection = pending.render.catch((reason: unknown) => reason);

    await fake.drain();
    await rejection;

    expect(tbody.rows.length).toBe(boundary);
    expect((tbody.rows.length - FIRST_SCREENFUL) % DEFAULT_CHUNK_SIZE).toBe(0);

    await fake.drain();

    expect(tbody.rows.length).toBe(boundary);
  });
});

describe('renderInvoices, vanilla flavor', () => {
  it('renders every row even when higher priority work is already waiting', () => {
    const { fake } = installFakeScheduler();
    const tbody = createTbody();
    const order: string[] = [];

    const waiting = postSchedulerTask(() => order.push('user input'), { priority: 'user-blocking' });

    renderInvoicesVanilla(tbody, createInvoices(TOTAL_INVOICES));

    // synchronous loop blocks thread so all rows land regardless of queued priority work
    expect(tbody.rows.length).toBe(TOTAL_INVOICES);
    expect(order).toEqual([]);

    waiting.cancel();
    fake.runNext();
  });

  it('keeps rendering when a callback scheduled during the loop aborts its signal', async () => {
    installFakeScheduler();
    const tbody = createTbody();
    const controller = new AbortController();
    const observer = new MutationObserver(() => controller.abort());

    observer.observe(tbody, { childList: true });
    renderInvoicesVanilla(tbody, createInvoices(TOTAL_INVOICES), controller.signal);

    // the observer callback was queued by the first row and still has not run
    expect(controller.signal.aborted).toBe(false);
    expect(tbody.rows.length).toBe(TOTAL_INVOICES);

    await flushMicrotasks();
    observer.disconnect();

    expect(controller.signal.aborted).toBe(true);
    expect(tbody.rows.length).toBe(TOTAL_INVOICES);
  });

  it('stops the scheduled flavor when its signal is aborted, so the comparison is fair', async () => {
    const { fake } = installFakeScheduler();
    const tbody = createTbody();
    const controller = new AbortController();

    const render = renderInvoicesScheduled(tbody, createInvoices(TOTAL_INVOICES), controller.signal);

    fake.runNext();
    await flushMicrotasks();

    const rowsAtAbort = tbody.rows.length;
    controller.abort();

    await fake.drain();
    await render;

    expect(rowsAtAbort).toBeGreaterThan(FIRST_SCREENFUL);
    expect(tbody.rows.length).toBe(rowsAtAbort);
    expect(tbody.dataset.rendering).toBeUndefined();
  });
});
