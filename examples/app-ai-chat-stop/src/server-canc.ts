// Canc server: the same /chat route, wrapped by cancelableHandler.

import * as canc from '@cancjs/coroutine';
import { cancelableHandler } from '@cancjs/server-express';
import express, { Express } from 'express';

import { UsageLog } from './chat';
import { streamChat } from './chat-service-canc';

export function createServer(): { app: Express; log: UsageLog } {
  const app = express();
  const log = new UsageLog();
  app.use(express.json());
  app.use(express.static('public'));

  // (no leaky route. cancellation is built into the one route below)

  // The handler is the coroutine, and cancelableHandler cancels it on client disconnect.
  app.post(
    '/chat',
    cancelableHandler(function* (req, res) {
      const sink = { write: (token: string) => res.write(token) };
      yield* canc.await(streamChat({ prompt: req.body.prompt }, sink, log));
      res.end();
    }),
  );

  return { app, log };
}
