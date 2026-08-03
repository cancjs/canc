import '@cancjs/unhandled-rejection/register';

import { bootstrapApplication } from '@angular/platform-browser';

import { appConfig } from './app/app.config-canc';
import { DashboardComponent } from './app/dashboard.component-canc';

bootstrapApplication(DashboardComponent, appConfig).catch((err) => console.error(err));
