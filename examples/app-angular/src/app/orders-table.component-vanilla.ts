import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, OnInit, Output } from '@angular/core';

// (no cancelable promise counterpart, see -canc)
import { promiseResource } from '../lib/promise-resource';
import { ORDERS_SERVICE, type OrderSummary } from './orders.types';

// Orders table. It lists the orders and emits the selected id; the supersede lesson lives in the
// detail pane beside it. What it adds here is the other half: a user who leaves before the list
// arrives still pays for it, because a plain promise has no lifetime to be bound to.
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

  orders = promiseResource<OrderSummary[]>();
  selectedId: string | null = null;

  private readonly ordersService = inject(ORDERS_SERVICE);

  ngOnInit(): void {
    // (no cancelable promise counterpart, see -canc) A plain promise is all the service can hand
    // back, and the resource takes it as is.
    this.orders.run(this.ordersService.list());
  }

  select(id: string): void {
    this.selectedId = id;
    this.selectedIdChange.emit(id);
  }
}
