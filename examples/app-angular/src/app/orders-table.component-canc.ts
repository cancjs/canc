import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, OnInit, Output } from '@angular/core';
import type { CancelablePromise } from '@cancjs/promise';

import { cancelableResource } from '../lib/cancelable-resource';
import { ORDERS_SERVICE, type OrderSummary } from './orders.types';

// Orders table. It lists the orders and emits the selected id; the supersede lesson lives in the
// detail pane beside it. What it adds here is the other half: a user who leaves before the list
// arrives cancels it, because the resource is bound to the component's lifetime.
@Component({
  selector: 'app-orders-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <table>
      <tbody>
        <tr
          *ngFor="let order of orders.value"
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
export class OrdersTableComponent implements OnInit {
  @Output() selectedIdChange = new EventEmitter<string>();

  orders = cancelableResource<OrderSummary[]>();
  selectedId: string | null = null;

  private readonly ordersService = inject(ORDERS_SERVICE);

  ngOnInit(): void {
    // The token is typed with plain promises so every flavor fits it. All canc flavors hand back a
    // cancelable one, so it is narrowed here once rather than at each use.
    this.orders.run(this.ordersService.list() as CancelablePromise<OrderSummary[]>);
  }

  select(id: string): void {
    this.selectedId = id;
    this.selectedIdChange.emit(id);
  }
}
