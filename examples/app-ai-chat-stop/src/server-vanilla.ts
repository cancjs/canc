// Vanilla server: an express app whose /chat route streams tokens over a chunked text response.
//
// Disconnect handling is manual: create an AbortController per request and listen for 'close'.

import express, { Express } from 'express';

import { UsageLog } from './chat';
import { streamChat, streamChatAbortable } from './chat-service-vanilla';

export function createServer(): { app: Express; log: UsageLog } {
  const app = express();
  const log = new UsageLog();
  app.use(express.json());
  app.use(express.static('public'));

  // Uncancelable route: no controller, no 'close' handler.
  app.post('/chat/leaky', async (req, res) => {
    const sink = { write: (token: string) => res.write(token) };
    // nothing to abort: the request runs to completion no matter what the client does
    await streamChat({ prompt: req.body.prompt }, sink, log);
    res.end();
  });

  // Abortable route: an AbortController is threaded into the service and aborted on socket close.
  app.post('/chat', async (req, res) => {
    const controller = new AbortController();
    const sink = { write: (token: string) => res.write(token) };
    // remember to abort on disconnect, or the leak above happens here too
    res.on('close', () => controller.abort());
    if (req.destroyed) controller.abort();
    await streamChatAbortable({ prompt: req.body.prompt }, sink, log, controller);
    res.end();
  });

  return { app, log };
}
