import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Observable } from 'rxjs';

import { OrdersServiceObservable } from './orders.service-obs';
import type { OrderSummary } from './orders.types';

// Orders table written the RxJS way. The observable is cold, so the async pipe starts the request
// when it subscribes and tears it down when the component goes away. There is no lifecycle hook at
// all here, which is RxJS at its best: this is the case where the stream shape costs nothing.
@Component({
  selector: 'app-orders-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <table>
      <tbody>
        <tr
          *ngFor="let order of orders$ | async"
          [attr.data-testid]="'row-' + order.id"
          [class.selected]="order.id === selectedId"
          (click)="select(order.id)"
        >
          <td>{{ order.id }}</td>
          <td>{{ order.customer }}</td>
          <td>{{ order.total | number }}</td>
          <td>{{ order.status }}</td>
        </tr>
      </tbody>
    </table>
  `,
})
export class OrdersTableComponent {
  @Output() selectedIdChange = new EventEmitter<string>();

  selectedId: string | null = null;

  private readonly ordersService = inject(OrdersServiceObservable);

  // The async pipe already unsubscribes on destroy. takeUntilDestroyed covers any other subscriber
  // the component picks up later, so the teardown is not tied to one template.
  readonly orders$: Observable<OrderSummary[]> = this.ordersService.list().pipe(takeUntilDestroyed());

  select(id: string): void {
    this.selectedId = id;
    this.selectedIdChange.emit(id);
  }
}
