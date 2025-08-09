import { type ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';

import { ORDERS_SERVICE } from './orders.types';
import { OrdersService } from './orders.service-vanilla';

// (no decorator/manual flavor switch — the vanilla service has no cancelable counterpart)

export const appConfig: ApplicationConfig = {
 providers: [
 provideZoneChangeDetection({ eventCoalescing: true }),
 provideHttpClient(),
 { provide: ORDERS_SERVICE, useClass: OrdersService },
 ],
};
