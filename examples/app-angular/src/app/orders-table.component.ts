// Orders table. Suffix-free shared component: identical for both flavors. It only lists orders and
// emits the selected id; the cancellation lesson lives in the detail pane it hosts.

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, OnInit, Output } from '@angular/core';

import { ORDERS_SERVICE, type OrderSummary } from './orders.types';

@Component({
  selector: 'app-orders-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <table>
      <tbody>
        <tr
          *ngFor="let order of orders"
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

  orders: OrderSummary[] = [];
  selectedId: string | null = null;

  private readonly ordersService = inject(ORDERS_SERVICE);

  async ngOnInit(): Promise<void> {
    this.orders = await this.ordersService.list();
  }

  select(id: string): void {
    this.selectedId = id;
    this.selectedIdChange.emit(id);
  }
}
