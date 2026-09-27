// WebSocket export server where cancel stops sending but transcode runs to completion

import { MockApi } from '@shared/mock-api';
import { on } from 'events';
import express from 'express';
import { createServer } from 'http';
import { join } from 'path';
import { WebSocket, WebSocketServer } from 'ws';

import { exportJob } from './export-job-vanilla';
import { ClientMessage, parseClientMessage, ServerMessage } from './protocol';

export interface ServerHandle {
  port: number;
  api: MockApi;
  close: () => Promise<void>;
}

export function startServer(api: MockApi, port = 0): Promise<ServerHandle> {
  const app = express();
  app.use(express.static(join(__dirname, '../public')));
  const http = createServer(app);
  const wss = new WebSocketServer({ server: http });

  wss.on('connection', (ws) => handleConnection(ws, api));

  return new Promise((resolve) => {
    http.listen(port, () => {
      const address = http.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        port: actualPort,
        api,
        close: () =>
          new Promise<void>((done) => {
            for (const client of wss.clients) client.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}

function handleConnection(ws: WebSocket, api: MockApi): void {
  // no cancel root: tracks only which jobs stop sending
  const stopped = new Set<string>();
  const jobs = new Set<string>();

  // socket close marks jobs stopped while transcode continues server-side
  ws.on('close', () => {
    for (const jobId of jobs) stopped.add(jobId);
  });
  // (no cancellation counterpart, see -canc)

  void readMessages(ws, api, stopped, jobs);
}

async function readMessages(ws: WebSocket, api: MockApi, stopped: Set<string>, jobs: Set<string>): Promise<void> {
  // iterator ends only when socket itself closes
  try {
    for await (const [raw] of on(ws, 'message')) {
      const message = parseClientMessage(String(raw));
      if (!message) continue;
      dispatch(message, ws, api, stopped, jobs);
    }
  } catch (error) {
    if ((error as { name?: string }).name !== 'AbortError') throw error;
    // abort error never occurs without signal (aligned with -canc)
  }
}

function dispatch(message: ClientMessage, ws: WebSocket, api: MockApi, stopped: Set<string>, jobs: Set<string>): void {
  if (message.type === 'start') {
    if (jobs.has(message.jobId)) return;
    jobs.add(message.jobId);
    void runJob(message.jobId, ws, api, stopped, jobs);
  } else {
    // cancel only stops sending while remaining chunks transcode on server
    stopped.add(message.jobId);
    send(ws, { type: 'canceled', jobId: message.jobId });
  }
}

async function runJob(
  jobId: string,
  ws: WebSocket,
  api: MockApi,
  stopped: Set<string>,
  jobs: Set<string>,
): Promise<void> {
  // every chunk runs to completion with no signal threaded
  const iter = exportJob({ api });

  for await (const percent of iter) {
    // guard only sending; transcode work already ran
    if (!stopped.has(jobId)) send(ws, { type: 'progress', jobId, percent });
  }
  jobs.delete(jobId);
  if (!stopped.has(jobId)) send(ws, { type: 'done', jobId });
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}
