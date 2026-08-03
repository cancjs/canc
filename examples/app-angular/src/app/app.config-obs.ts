import { provideHttpClient } from '@angular/common/http';
import { type ApplicationConfig, provideZoneChangeDetection } from '@angular/core';

import { OrdersServiceObservable } from './orders.service-obs';

// (no flavor switch, the components subscribe to the one Observable service directly)

export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), provideHttpClient(), OrdersServiceObservable],
};
