import { type ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';

import { ORDERS_SERVICE } from './orders.types';
import { OrdersService } from './orders.service-canc';
import { OrdersServiceManual } from './orders.service-manual-canc';

// Flip DECORATOR_FLAVOR to run the same dashboard against the manual (non-decorator) service. Both
// satisfy ORDERS_SERVICE, so no component changes.
const DECORATOR_FLAVOR = true;

export const appConfig: ApplicationConfig = {
 providers: [
 provideZoneChangeDetection({ eventCoalescing: true }),
 provideHttpClient(),
 { provide: ORDERS_SERVICE, useClass: DECORATOR_FLAVOR ? OrdersService : OrdersServiceManual },
 ],
};
