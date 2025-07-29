// Canc server: the same /chat route, but the streaming call is a CancelablePromise, so a socket
// close is one line: cancel the chain. Cancellation flows down to the LLM's AbortSignal on its own.

import express, { Express } from 'express';
import { suppressCancel } from '@cancjs/promise';
import { streamChat } from './chat-service-canc';
import { UsageLog } from './chat';

export function createServer(): { app: Express; log: UsageLog } {
 const app = express();
 const log = new UsageLog();
 app.use(express.json());
 app.use(express.static('public'));

 // (no leaky route — cancellation is built into the one route below)

 // The whole handler chain is one cancelable promise. Disconnect or Stop cancels it in one line,
 // and suppressCancel keeps the expected cancel rejection from surfacing as an error.
 app.post('/chat', (req, res) => {
 const sink = { write: (token: string) => res.write(token) };
 const chat = streamChat({ prompt: req.body.prompt }, sink, log);
 // disconnect/Stop = one line; the cancel aborts the stream all the way down
 res.on('close', () => void chat.cancel());
 void suppressCancel(chat.then(() => res.end()));
 });

 return { app, log };
}
