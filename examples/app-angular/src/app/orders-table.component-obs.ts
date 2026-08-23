import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Observable } from 'rxjs';

import { OrdersServiceObservable } from './orders.service-obs';
import type { OrderSummary } from './orders.types';

// orders table where async pipe and takeUntilDestroyed cancel on unmount
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

  // takeUntilDestroyed covers subscribers beyond the async pipe
  readonly orders$: Observable<OrderSummary[]> = this.ordersService.list().pipe(takeUntilDestroyed());

  select(id: string): void {
    this.selectedId = id;
    this.selectedIdChange.emit(id);
  }
}
