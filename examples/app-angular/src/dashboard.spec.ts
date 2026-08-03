import { TestBed } from '@angular/core/testing';

import { toCancelableOrdersService } from './app/app.config-canc';
import { DetailPaneComponent as CancDetailPane } from './app/detail-pane.component-canc';
import { DetailPaneComponent as ObsDetailPane } from './app/detail-pane.component-obs';
import { DetailPaneComponent as VanillaDetailPane } from './app/detail-pane.component-vanilla';
import { ORDERS_API } from './app/orders.api';
import { OrdersService as OrdersServiceCanc } from './app/orders.service-canc';
import { OrdersServiceManual } from './app/orders.service-manual-canc';
import { OrdersServiceObservable } from './app/orders.service-obs';
import { OrdersService as OrdersServiceVanilla } from './app/orders.service-vanilla';
import { CANCELABLE_ORDERS_SERVICE, ORDERS_SERVICE } from './app/orders.types';
import { OrdersTableComponent as CancOrdersTable } from './app/orders-table.component-canc';
import { OrdersTableComponent as VanillaOrdersTable } from './app/orders-table.component-vanilla';
import { createOrdersApi, type OrdersApi } from './mock/api';

const LATENCY = 50;

function countByStatus(api: OrdersApi, endpoint: string, status: string): number {
  return api.calls.filter((c) => c.endpoint === endpoint && c.status === status).length;
}

// Components are provided in the testing module and pulled via TestBed.inject, so inject()/
// DestroyRef work; the spec then drives ngOnChanges/onDestroy by hand. This exercises the
// cancellation logic without compiling a template, so it runs under plain ts-jest.

describe('canc detail pane (decorator service)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('cancels the previous detail load when the selected row changes', async () => {
    const api = createOrdersApi({ latency: LATENCY });
    TestBed.configureTestingModule({
      providers: [
        { provide: ORDERS_API, useValue: api },
        { provide: CANCELABLE_ORDERS_SERVICE, useClass: OrdersServiceCanc },
        CancDetailPane,
      ],
    });
    const pane = TestBed.inject(CancDetailPane);

    // Select A, then B before A can finish: A's detail load is superseded and canceled.
    pane.orderId = 'o1001';
    pane.ngOnChanges();
    await Promise.resolve();
    pane.orderId = 'o1002';
    pane.ngOnChanges();
    await Promise.resolve();

    jest.advanceTimersByTime(LATENCY);
    await Promise.resolve();
    await Promise.resolve();

    expect(countByStatus(api, 'orders.detail', 'aborted')).toBe(1);
    expect(countByStatus(api, 'orders.detail', 'completed')).toBe(1);
    expect(pane.orderDetail.value?.id).toBe('o1002');
  });

  it('cancels the pending detail load when the selection is cleared', async () => {
    const api = createOrdersApi({ latency: LATENCY });
    TestBed.configureTestingModule({
      providers: [
        { provide: ORDERS_API, useValue: api },
        { provide: CANCELABLE_ORDERS_SERVICE, useClass: OrdersServiceCanc },
        CancDetailPane,
      ],
    });
    const pane = TestBed.inject(CancDetailPane);

    pane.orderId = 'o1001';
    pane.ngOnChanges();
    await Promise.resolve();
    pane.orderId = null;
    pane.ngOnChanges();
    await Promise.resolve();

    jest.advanceTimersByTime(LATENCY);
    await Promise.resolve();

    expect(countByStatus(api, 'orders.detail', 'aborted')).toBe(1);
    expect(countByStatus(api, 'orders.detail', 'completed')).toBe(0);
    expect(pane.orderDetail.status).toBe('idle');
    expect(pane.orderDetail.value).toBeUndefined();
  });

  it('cancels the pending detail load on destroy', async () => {
    const api = createOrdersApi({ latency: LATENCY });
    TestBed.configureTestingModule({
      providers: [
        { provide: ORDERS_API, useValue: api },
        { provide: CANCELABLE_ORDERS_SERVICE, useClass: OrdersServiceCanc },
        CancDetailPane,
      ],
    });
    const pane = TestBed.inject(CancDetailPane);

    pane.orderId = 'o1001';
    pane.ngOnChanges();
    await Promise.resolve();

    TestBed.resetTestingModule(); // triggers DestroyRef.onDestroy
    jest.advanceTimersByTime(LATENCY);
    await Promise.resolve();

    expect(countByStatus(api, 'orders.detail', 'aborted')).toBe(1);
    expect(countByStatus(api, 'orders.detail', 'completed')).toBe(0);
  });
});

describe('canc detail pane (manual service)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('behaves identically with the non-decorator service flavor', async () => {
    const api = createOrdersApi({ latency: LATENCY });
    TestBed.configureTestingModule({
      providers: [
        { provide: ORDERS_API, useValue: api },
        { provide: CANCELABLE_ORDERS_SERVICE, useClass: OrdersServiceManual },
        CancDetailPane,
      ],
    });
    const pane = TestBed.inject(CancDetailPane);

    pane.orderId = 'o1001';
    pane.ngOnChanges();
    await Promise.resolve();
    pane.orderId = 'o1002';
    pane.ngOnChanges();
    await Promise.resolve();

    jest.advanceTimersByTime(LATENCY);
    await Promise.resolve();
    await Promise.resolve();

    expect(countByStatus(api, 'orders.detail', 'aborted')).toBe(1);
    expect(pane.orderDetail.value?.id).toBe('o1002');
  });
});

describe('canc detail pane (Observable service adapted to promises)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  // The adapter is only worth anything if the Observable really aborts on unsubscribe. A service
  // that wrapped an already-started promise would still report a completed call here.
  it('aborts the superseded request through unsubscribe', async () => {
    const api = createOrdersApi({ latency: LATENCY });
    TestBed.configureTestingModule({
      providers: [
        { provide: ORDERS_API, useValue: api },
        OrdersServiceObservable,
        { provide: CANCELABLE_ORDERS_SERVICE, useFactory: toCancelableOrdersService, deps: [OrdersServiceObservable] },
        CancDetailPane,
      ],
    });
    const pane = TestBed.inject(CancDetailPane);

    pane.orderId = 'o1001';
    pane.ngOnChanges();
    await Promise.resolve();
    pane.orderId = 'o1002';
    pane.ngOnChanges();
    await Promise.resolve();

    jest.advanceTimersByTime(LATENCY);
    await Promise.resolve();
    await Promise.resolve();

    expect(countByStatus(api, 'orders.detail', 'aborted')).toBe(1);
    expect(countByStatus(api, 'orders.detail', 'completed')).toBe(1);
    expect(pane.orderDetail.value?.id).toBe('o1002');
  });
});

describe('RxJS detail pane', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  function setup(api: OrdersApi) {
    TestBed.configureTestingModule({
      providers: [{ provide: ORDERS_API, useValue: api }, OrdersServiceObservable, ObsDetailPane],
    });
    const pane = TestBed.inject(ObsDetailPane);
    const seenIds: (string | undefined)[] = [];
    // Standing in for the async pipe, which is what subscribes in the running app.
    pane.orderDetail$.subscribe((view) => seenIds.push(view.value?.id));
    return { pane, seenIds };
  }

  it('aborts the superseded request through switchMap', async () => {
    const api = createOrdersApi({ latency: LATENCY });
    const { pane, seenIds } = setup(api);

    pane.orderId = 'o1001';
    pane.ngOnChanges();
    await Promise.resolve();
    pane.orderId = 'o1002';
    pane.ngOnChanges();
    await Promise.resolve();

    jest.advanceTimersByTime(LATENCY);
    await Promise.resolve();
    await Promise.resolve();

    expect(countByStatus(api, 'orders.detail', 'aborted')).toBe(1);
    expect(countByStatus(api, 'orders.detail', 'completed')).toBe(1);
    expect(seenIds.at(-1)).toBe('o1002');
  });

  it('aborts the pending request on destroy', async () => {
    const api = createOrdersApi({ latency: LATENCY });
    const { pane } = setup(api);

    pane.orderId = 'o1001';
    pane.ngOnChanges();
    await Promise.resolve();

    TestBed.resetTestingModule(); // triggers the takeUntilDestroyed teardown
    jest.advanceTimersByTime(LATENCY);
    await Promise.resolve();

    expect(countByStatus(api, 'orders.detail', 'aborted')).toBe(1);
    expect(countByStatus(api, 'orders.detail', 'completed')).toBe(0);
  });
});

describe('vanilla detail pane', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('keeps the superseded load running, which is the wasted work we teach', async () => {
    const api = createOrdersApi({ latency: LATENCY });
    TestBed.configureTestingModule({
      providers: [
        { provide: ORDERS_API, useValue: api },
        { provide: ORDERS_SERVICE, useClass: OrdersServiceVanilla },
        VanillaDetailPane,
      ],
    });
    const pane = TestBed.inject(VanillaDetailPane);

    pane.orderId = 'o1001';
    pane.ngOnChanges();
    await Promise.resolve();
    pane.orderId = 'o1002';
    pane.ngOnChanges();
    await Promise.resolve();

    jest.advanceTimersByTime(LATENCY);
    await Promise.resolve();
    await Promise.resolve();

    // Inverted assertion: the plain service cannot cancel, so both loads complete.
    expect(countByStatus(api, 'orders.detail', 'completed')).toBe(2);
    expect(countByStatus(api, 'orders.detail', 'aborted')).toBe(0);
    // The request-id guard still keeps the correct (latest) row on screen.
    expect(pane.orderDetail.value?.id).toBe('o1002');
  });

  it('lets a cleared selection finish its request anyway', async () => {
    const api = createOrdersApi({ latency: LATENCY });
    TestBed.configureTestingModule({
      providers: [
        { provide: ORDERS_API, useValue: api },
        { provide: ORDERS_SERVICE, useClass: OrdersServiceVanilla },
        VanillaDetailPane,
      ],
    });
    const pane = TestBed.inject(VanillaDetailPane);

    pane.orderId = 'o1001';
    pane.ngOnChanges();
    await Promise.resolve();
    pane.orderId = null;
    pane.ngOnChanges();
    await Promise.resolve();

    jest.advanceTimersByTime(LATENCY);
    await Promise.resolve();

    // The reset does invalidate the response, so the pane stays empty. The request still ran.
    expect(countByStatus(api, 'orders.detail', 'completed')).toBe(1);
    expect(countByStatus(api, 'orders.detail', 'aborted')).toBe(0);
    expect(pane.orderDetail.status).toBe('idle');
    expect(pane.orderDetail.value).toBeUndefined();
  });
});

describe('orders table', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('cancels the list load on destroy in the canc flavor', async () => {
    const api = createOrdersApi({ latency: LATENCY });
    TestBed.configureTestingModule({
      providers: [
        { provide: ORDERS_API, useValue: api },
        { provide: CANCELABLE_ORDERS_SERVICE, useClass: OrdersServiceCanc },
        CancOrdersTable,
      ],
    });
    const table = TestBed.inject(CancOrdersTable);

    table.ngOnInit();
    await Promise.resolve();

    TestBed.resetTestingModule();
    jest.advanceTimersByTime(LATENCY);
    await Promise.resolve();

    expect(countByStatus(api, 'orders.list', 'aborted')).toBe(1);
    expect(countByStatus(api, 'orders.list', 'completed')).toBe(0);
  });

  it('finishes the list load after destroy in the vanilla flavor', async () => {
    const api = createOrdersApi({ latency: LATENCY });
    TestBed.configureTestingModule({
      providers: [
        { provide: ORDERS_API, useValue: api },
        { provide: ORDERS_SERVICE, useClass: OrdersServiceVanilla },
        VanillaOrdersTable,
      ],
    });
    const table = TestBed.inject(VanillaOrdersTable);

    table.ngOnInit();
    await Promise.resolve();

    TestBed.resetTestingModule();
    jest.advanceTimersByTime(LATENCY);
    await Promise.resolve();

    // Inverted assertion: nobody is left to read the result, and the request runs to the end.
    expect(countByStatus(api, 'orders.list', 'aborted')).toBe(0);
    expect(countByStatus(api, 'orders.list', 'completed')).toBe(1);
  });
});
