import type { Provider, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { sleep } from '@shared/util';

import { toCancelableOrdersService } from './app/app.config-canc';
import { DashboardComponent as CancDashboard } from './app/dashboard.component-canc';
import { DashboardComponent as ObsDashboard } from './app/dashboard.component-obs';
import { DashboardComponent as VanillaDashboard } from './app/dashboard.component-vanilla';
import { ORDERS_API } from './app/orders.api';
import { OrdersService as OrdersServiceCanc } from './app/orders.service-canc';
import { OrdersServiceObservable } from './app/orders.service-obs';
import { OrdersService as OrdersServiceVanilla } from './app/orders.service-vanilla';
import { CANCELABLE_ORDERS_SERVICE, ORDERS_SERVICE } from './app/orders.types';
import { createOrdersApi } from './mock/api';

// The rest of the suite drives the components directly and never compiles a template. This one
// renders each dashboard instead, so a template that references a field the component no longer has
// fails here. Angular's own template checker does not run in this example (the CLI build needs a
// TypeScript version older than the one hoisted at the examples root).

async function renderDashboard(component: Type<unknown>, providers: Provider[]): Promise<string> {
  const api = createOrdersApi({ latency: 0 });
  TestBed.configureTestingModule({
    providers: [{ provide: ORDERS_API, useValue: api }, ...providers],
  });

  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  // Let the list request settle, then render the rows it produced.
  await sleep(20);
  fixture.detectChanges();

  return (fixture.nativeElement as HTMLElement).innerHTML;
}

describe('dashboard templates', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the canc dashboard', async () => {
    const html = await renderDashboard(CancDashboard, [
      { provide: CANCELABLE_ORDERS_SERVICE, useClass: OrdersServiceCanc },
    ]);

    expect(html).toContain('data-testid="detail-pane"');
    expect(html).toContain('data-testid="row-o1001"');
  });

  it('renders the vanilla dashboard', async () => {
    const html = await renderDashboard(VanillaDashboard, [{ provide: ORDERS_SERVICE, useClass: OrdersServiceVanilla }]);

    expect(html).toContain('data-testid="detail-pane"');
    expect(html).toContain('data-testid="row-o1001"');
  });

  it('renders the observable dashboard', async () => {
    const html = await renderDashboard(ObsDashboard, [OrdersServiceObservable]);

    expect(html).toContain('data-testid="detail-pane"');
    expect(html).toContain('data-testid="row-o1001"');
  });

  it('renders the canc dashboard against the adapted observable service', async () => {
    const html = await renderDashboard(CancDashboard, [
      OrdersServiceObservable,
      { provide: CANCELABLE_ORDERS_SERVICE, useFactory: toCancelableOrdersService, deps: [OrdersServiceObservable] },
    ]);

    expect(html).toContain('data-testid="detail-pane"');
    expect(html).toContain('data-testid="row-o1001"');
  });
});
