import { bootstrapApplication } from '@angular/platform-browser';

import { appConfig } from './app/app.config-obs';
import { DashboardComponent } from './app/dashboard.component-obs';

bootstrapApplication(DashboardComponent, appConfig).catch((err) => console.error(err));
