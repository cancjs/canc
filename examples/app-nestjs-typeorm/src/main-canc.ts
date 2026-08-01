import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module-canc';
import { createDataSource } from './mock/db';
import { runDisconnectScenario } from './scenario';

/** Builds the canc app: cancel interceptor installed, invoice service (decorated or manual) wired. */
export async function createApp() {
  const dataSource = await createDataSource();
  const app = await NestFactory.create(AppModule.register(dataSource), { logger: false });
  return { app, dataSource };
}

if (require.main === module) {
  runDisconnectScenario('canc', createApp).then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
