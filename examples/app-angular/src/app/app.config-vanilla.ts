import { provideHttpClient } from '@angular/common/http';
import { type ApplicationConfig, provideZoneChangeDetection } from '@angular/core';

import { OrdersService } from './orders.service-vanilla';
import { ORDERS_SERVICE } from './orders.types';

// (no flavor switch, see -canc: the vanilla service has no cancelable counterpart to swap in)

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    { provide: ORDERS_SERVICE, useClass: OrdersService },
  ],
};
