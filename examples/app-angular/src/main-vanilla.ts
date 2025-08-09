import { bootstrapApplication } from '@angular/platform-browser';

import { appConfig } from './app/app.config-vanilla';
import { DashboardComponent } from './app/dashboard.component-vanilla';

bootstrapApplication(DashboardComponent, appConfig).catch((err) => console.error(err));
