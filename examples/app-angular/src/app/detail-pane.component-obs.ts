import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnChanges } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map, type Observable, of, startWith, Subject, switchMap } from 'rxjs';

import { OrdersServiceObservable } from './orders.service-obs';
import type { OrderDetail } from './orders.types';

/** What the template renders. The two promise flavors read the same fields off their resource. */
interface DetailView {
  status: 'idle' | 'pending' | 'fulfilled';
  value: OrderDetail | undefined;
}

const IDLE_VIEW: DetailView = { status: 'idle', value: undefined };
const PENDING_VIEW: DetailView = { status: 'pending', value: undefined };

// switchMap and takeUntilDestroyed abort in-flight requests on new id or destroy
@Component({
  selector: 'app-detail-pane',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section
      class="detail"
      data-testid="detail-pane"
    >
      <ng-container *ngIf="orderDetail$ | async as view">
        <p
          *ngIf="view.status === 'pending'"
          data-testid="detail-loading"
        >
          Loading order {{ orderId }}…
        </p>
        <ng-container *ngIf="view.value as d">
          <h3 data-testid="detail-id">{{ d.id }}</h3>
          <p>{{ d.customer }} — {{ d.status }} — {{ d.total | number }}</p>
          <ul>
            <li *ngFor="let line of d.lines">{{ line.qty }}× {{ line.name }}</li>
          </ul>
        </ng-container>
      </ng-container>
    </section>
  `,
})
export class DetailPaneComponent implements OnChanges {
  @Input() orderId: string | null = null;

  private readonly orders = inject(OrdersServiceObservable);
  private readonly orderId$ = new Subject<string | null>();

  // stream error would terminate pipe without catchError
  readonly orderDetail$: Observable<DetailView> = this.orderId$.pipe(
    switchMap((orderId) =>
      orderId ?
        this.orders.detail(orderId).pipe(
          map((value): DetailView => ({ status: 'fulfilled', value })),
          startWith(PENDING_VIEW),
        )
      : of(IDLE_VIEW),
    ),
    takeUntilDestroyed(),
  );

  ngOnChanges(): void {
    this.orderId$.next(this.orderId);
  }
}
