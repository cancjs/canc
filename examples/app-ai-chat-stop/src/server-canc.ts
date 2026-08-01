// Canc server: the same /chat route, but the handler is a cancAsync coroutine wrapped by
// cancAsyncRoute, so a socket close cancels the whole chain. Cancellation flows down to the LLM's
// AbortSignal on its own, and the wrapper handles the disconnect wiring (including a request that is
// already gone before dispatch).

import { cancAwait } from '@cancjs/coroutine';
import express, { Express } from 'express';

import { UsageLog } from './chat';
import { streamChat } from './chat-service-canc';
import { cancAsyncRoute } from './lib/cancelable-route';

export function createServer(): { app: Express; log: UsageLog } {
  const app = express();
  const log = new UsageLog();
  app.use(express.json());
  app.use(express.static('public'));

  // (no leaky route. cancellation is built into the one route below)

  // The handler is the coroutine, and cancAsyncRoute cancels it when the client disconnects before
  // the reply finishes. Canceling the chain aborts the stream all the way down to the LLM signal.
  app.post(
    '/chat',
    cancAsyncRoute(function* (req, res) {
      const sink = { write: (token: string) => res.write(token) };
      yield* cancAwait(streamChat({ prompt: req.body.prompt }, sink, log));
      res.end();
    }),
  );

  return { app, log };
}
