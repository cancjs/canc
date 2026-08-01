import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module-vanilla';
import { createDataSource } from './mock/db';
import { runDisconnectScenario } from './scenario';

/** Builds the vanilla app: passthrough interceptor installed, plain invoice service wired. */
export async function createApp() {
  const dataSource = await createDataSource();
  const app = await NestFactory.create(AppModule.register(dataSource), { logger: false });
  return { app, dataSource };
}

if (require.main === module) {
  runDisconnectScenario('vanilla', createApp).then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
