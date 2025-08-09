import { TestBed } from '@angular/core/testing';

import { DetailPaneComponent as CancDetailPane } from './app/detail-pane.component-canc';
import { DetailPaneComponent as VanillaDetailPane } from './app/detail-pane.component-vanilla';
import { OrdersService as OrdersServiceCanc } from './app/orders.service-canc';
import { OrdersServiceManual } from './app/orders.service-manual-canc';
import { OrdersService as OrdersServiceVanilla } from './app/orders.service-vanilla';
import { ORDERS_SERVICE } from './app/orders.types';
import { ORDERS_API } from './app/orders.api';
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
 { provide: ORDERS_SERVICE, useClass: OrdersServiceCanc },
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
 expect(pane.detail?.id).toBe('o1002');
 });

 it('cancels the pending detail load on destroy', async () => {
 const api = createOrdersApi({ latency: LATENCY });
 TestBed.configureTestingModule({
 providers: [
 { provide: ORDERS_API, useValue: api },
 { provide: ORDERS_SERVICE, useClass: OrdersServiceCanc },
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
 { provide: ORDERS_SERVICE, useClass: OrdersServiceManual },
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
 expect(pane.detail?.id).toBe('o1002');
 });
});

describe('vanilla detail pane', () => {
 beforeEach(() => jest.useFakeTimers());
 afterEach(() => {
 jest.useRealTimers();
 TestBed.resetTestingModule();
 });

 it('keeps the superseded load running — the wasted work we teach', async () => {
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
 expect(pane.detail?.id).toBe('o1002');
 });
});
